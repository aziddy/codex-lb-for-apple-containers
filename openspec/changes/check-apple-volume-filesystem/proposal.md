## Why

Apple's container services are per-user launchd agents. When the Mac logs out, restarts, or shuts down, launchd terminates them without shutting the guest VM down, so a running codex-lb can leave the ext4 filesystem inside the `codex-lb-data` volume inconsistent. On 2026-09-14 a normal macOS shutdown did exactly that: the directory entry for SQLite's `store.db-shm` pointed at a deleted inode, and every subsequent start died in the entrypoint's migration step with `sqlite3.OperationalError: unable to open database file`. Recovery required a hand-built throwaway container with `CAP_SYS_ADMIN`, an apt install of `e2fsprogs`, an unmount, and a manual `e2fsck`. The lifecycle command should absorb that recovery so an unclean shutdown costs a few seconds at the next start instead of an outage.

## What Changes

- Ship `e2fsprogs` in the production image's runtime stage so the Apple lifecycle script can run `e2fsck` from the image it already uses for the short-lived ownership initializer.
- Make `up` and `restart` check the `codex-lb-data` filesystem with `e2fsck -p -f` from a short-lived root container that unmounts the volume first, only while the managed container is stopped, and continue only on a clean or automatically repaired result.
- Fail closed with manual-repair guidance when e2fsck leaves errors uncorrected, leaving an existing managed container stopped and the volume untouched; when the check itself cannot run, `up` restarts a container it had stopped and `restart` leaves it stopped, both with an actionable status.
- Report e2fsck's status from the guest offset by 100 so a CLI or VM failure can never be mistaken for a successful repair.
- Add fake-runtime regressions for ordering, the check command shape, repaired results, uncorrectable results, and tooling failures on both `up` and `restart`, plus contract assertions for the image, guide, and spec.
- Document unclean-shutdown behavior, the recommendation to stop codex-lb before shutting the Mac down, the fact that other start paths bypass the check, and the manual repair recipe in the Apple Containers guide and capability context.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment-installation`: Add the requirement that Apple Containers start operations verify and, when safe, repair the data volume filesystem before starting codex-lb.

## Impact

- Affected areas: `scripts/apple-container.sh`, the `Dockerfile` runtime stage, `tests/unit/test_apple_container_lifecycle.py`, `docs/deployment/apple-containers.md`, and the deployment-installation OpenSpec spec and context.
- The runtime stage of the shared production `Dockerfile` gains `e2fsprogs` (a few megabytes and one more package in the Trivy surface). Docker Compose, CI, and release builds use the same file, so the package also appears in Linux images; `Dockerfile.distroless` is untouched.
- The first `up` after this change performs a full image rebuild because the apt layer changes. `restart` against an image built before the check existed fails closed with an `e2fsck is missing` message until `up` has rebuilt; that is intended.
- No new `CODEX_LB_*` setting, README section, CLI subcommand, migration, or public API change. The check adds a few seconds to every `up` and `restart`; `CAP_SYS_ADMIN` is granted only to the throwaway check container.
- A host-side graceful-stop hook that prevents the corruption in the first place is deliberately out of scope and would be a separate change.
