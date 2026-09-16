## Context

Apple presents a named volume to a container only as an already-mounted ext4 filesystem; the CLI has no way to hand a container the raw `volume.img`, and macOS ships no `e2fsck`. Inside the guest, however, a root process with `CAP_SYS_ADMIN` can unmount the volume, at which point its virtio block device is available for a normal `e2fsck`. That is how the 2026-09-14 incident was repaired by hand, and it is the only supported path that keeps the repair inside the runtime the script already depends on.

The incident's damage was confined to guest filesystem metadata: SQLite's write-ahead log kept `store.db` consistent, but the dangling `store.db-shm` entry made every open fail. `e2fsck -p` cleared it in seconds. The lifecycle script should perform that step itself before every start, because the user-visible symptom ("the container will not start") looks like an application bug and the recovery requires knowledge of Apple's capability model.

## Goals / Non-Goals

**Goals:**

- Self-heal recoverable ext4 damage in `codex-lb-data` during `up` and `restart` with no configuration and no operator action.
- Never start codex-lb on a volume that e2fsck reports as inconsistent, and never let a runtime or CLI failure masquerade as a successful check.
- Keep the application container unprivileged; only the short-lived check container gains a capability.
- Keep the behavior testable through the existing fake `container` CLI harness.

**Non-Goals:**

- Preventing the damage by stopping the container on host shutdown (a login-item quit handler); that is a separate change.
- Automatic backups, volume resets, or running `e2fsck -y` without the operator.
- Changing `Dockerfile.distroless`, Compose, or Helm behavior beyond the shared runtime package.

## Decisions

### Ship e2fsck in the production image rather than a helper image

The script already runs a short-lived root container from `codex-lb:apple-local` to fix mount-root ownership, so using the same image for the check adds no new build, tag, or cache to manage. `e2fsprogs` is a Debian `required`-priority package that the slim base strips; adding it back costs a few megabytes. A separate `volume-check` stage or public image would keep the Linux images byte-identical but would double the images the script has to build and the tests have to model.

### Check only while the managed container is stopped, before any mutation

`up` runs the check after the image build and after `stop_managed_container`, immediately before the ownership initializer; `restart` runs it between stop and start. This is the only window where the volume is guaranteed to have no other user, and it is before `up` deletes anything, so a bad result leaves the previous container and the volume in place. On a fresh install the check auto-creates the volume, exactly as the initializer does today, and reports it clean.

### Report e2fsck's status offset by 100

e2fsck exits 1 for "errors corrected"; Apple's CLI also exits 1 when it cannot start the container, attach the volume, or find the image. With plain propagation a CLI failure would be reported as a repair and the app would start on an unchecked volume, and a runtime that swallowed exit codes would report "clean" forever. The guest therefore exits `100 + status` (with 64 and 65 reserved for a missing mount or a failed unmount). The host trusts only 100..107 and 227 (100 + 127, e2fsck absent) and treats every other value, including 0, as "could not verify". The design was confirmed on the real runtime: a guest `exit 103` reaches the host as 103.

### Fail closed, split by outcome

Uncorrected errors (status bit 4) mean the filesystem is known-inconsistent. Writing to it can allocate the same blocks twice, and the manual repair needs exclusive access, so `up` and `restart` neither initialize, delete, create, nor start codex-lb and leave an existing container stopped with the manual recipe printed. A check that could not run says nothing about the volume, and the previous process was serving from it a moment earlier, so `up` restarts a container it had stopped (the same rollback the ownership initializer uses) and fails; `restart` fails with the observed status and the hint that `up` rebuilds the image, which covers the stale-image case after upgrading.

### Preen mode only

`-p` applies only fixes e2fsck considers safe without a human, which is what an unattended start should do; `-y` answers yes to everything and belongs in the documented manual recipe after a backup. `-f` is required because the incident volume mounted "clean" and only failed on access.

## Risks / Trade-offs

- [Trivy surface grows by one package] → `ignore-unfixed` keeps unfixable CVEs from failing CI; a fixed HIGH in e2fsprogs is handled by rebuilding, as for any other package.
- [The check adds time to every start] → e2fsck on the 512 GB sparse volume completes in seconds because unused groups are skipped; the docs state the cost.
- [`container start codex-lb` and third-party UIs bypass the check] → documented; the lifecycle command is the supported start path.
- [A runtime that stops propagating exit codes] → fails closed by construction and the unit tests pin the `0` case.
- [Preen refuses a repair that `-y` would have made] → the operator gets the exact recipe and a backup instruction instead of an automatic `-y`.

## Migration Plan

No data migration. After pulling the change, run `./scripts/apple-container.sh up` once to rebuild the image; until then `restart` fails closed with `e2fsck is missing`. Existing volumes need no preparation; the first check either reports clean or repairs preen-safe damage.
