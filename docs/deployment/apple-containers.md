# Apple Containers

Run codex-lb with Apple's native `container` runtime—no Docker Desktop or
Compose translation required. This path builds the checked-out source and runs
the default single-replica SQLite deployment in a lightweight Linux VM.

## Requirements

- A Mac with Apple silicon
- macOS 26 or newer
- Apple `container` CLI 1.3 or newer
- `curl` (included with macOS)

Apple supports `container` on macOS 26 and Apple silicon. Install the current
signed package from the [Apple container releases](https://github.com/apple/container/releases),
then verify it:

```bash
container --version
```

The lifecycle script checks every prerequisite before it builds or changes a
container. Apple's [project requirements](https://github.com/apple/container#requirements)
and [command reference](https://github.com/apple/container/blob/main/docs/command-reference.md)
are the source of truth for installing and operating the runtime itself.

## Quick start

From the repository root:

```bash
./scripts/apple-container.sh up
open http://localhost:2455
```

The first run can take a few minutes. It:

1. Starts Apple container services and installs the default Linux kernel when
   needed.
2. Inspects Apple's active `default` network, validates its current IPv4
   gateway, and reserves only that gateway `/32` for protected localhost proxy
   traffic.
3. Builds the repository `Dockerfile` for `linux/arm64` as
   `codex-lb:apple-local`.
4. Checks the persistent `codex-lb-data` volume's filesystem with `e2fsck` from
   a short-lived privileged container and repairs recoverable errors.
5. Initializes the volume for the image's non-root user, then starts a labeled
   `codex-lb` container explicitly attached to the inspected network.
6. Publishes the dashboard/proxy on `127.0.0.1:2455` and the OAuth callback on
   `127.0.0.1:1455`.
7. Waits for `/health/ready` before printing the dashboard URL.

No environment file is required. Open the dashboard, add an account, and then
follow [Client Setup](../client-setup.md).

## Lifecycle commands

All operations use the same entry point:

| Command | Effect |
|---|---|
| `./scripts/apple-container.sh up` | Build the current checkout, safely replace the managed container, and wait for readiness |
| `./scripts/apple-container.sh build` | Build the image without changing the running container |
| `./scripts/apple-container.sh restart` | Check the data volume, then restart the existing managed container without rebuilding |
| `./scripts/apple-container.sh status` | Inspect the managed container |
| `./scripts/apple-container.sh logs` | Follow application logs; `Ctrl-C` stops following, not the container |
| `./scripts/apple-container.sh down` | Stop and remove the managed container while preserving its data volume |

Running the script without a command is the same as `up`.

The script labels the object it creates. If another container is already named
`codex-lb`, the script leaves it untouched and asks you to resolve the name
conflict explicitly.

## Configuration

The default install needs no configuration. To use existing codex-lb settings,
create `.env.local` at the repository root before `up`:

```bash
cp .env.example .env.local
# Edit only the settings you need.
./scripts/apple-container.sh up
```

When `.env.local` exists, the script passes it through Apple `container`'s
environment-file interface. It never creates or edits that file. Two values
are owned by this lifecycle path and are appended after the file:

- `CODEX_LB_DATA_DIR=/var/lib/codex-lb` keeps all default state in the only
  persistent mount.
- `CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=<gateway>/32` lets the protected
  proxy recognize requests forwarded from this Mac through Apple's VM gateway.

The gateway comes from `container network inspect default` on every `up` and
may differ across Macs or runtime configurations. Do not copy
`192.168.64.1/32` or any other observed address into portable configuration,
and do not authorize the full Apple VM subnet. Run `up`, rather than `restart`,
after changing the Apple default network because restart reuses the existing
container environment.

This exact `/32` is a zero-key exception only while global proxy API-key
authentication is disabled. Enabling API-key authentication remains
authoritative and still requires a valid key. The gateway represents the
Mac-side relay, not proof of the original caller, so enable API-key
authentication before adding a reverse proxy, tunnel, LAN publication, or any
other host relay.

The supported quick path binds both ports to localhost. To put codex-lb behind
a reverse proxy or expose it to other machines, keep the local binding and
follow [Remote Access](remote.md) and [Authentication](../authentication.md)
instead of weakening the launch defaults. [Client Setup](../client-setup.md)
shows how to give Codex the resulting API key.

## Persistence and upgrades

Application state lives in the Apple named volume `codex-lb-data`, mounted at
`/var/lib/codex-lb`. It contains the SQLite database, encryption key, and
archives. `up`, `restart`, and `down` never delete or prune this volume.

Apple's runtime creates a new volume with a root-owned mount point and does not
provide Docker's container-detection marker. The launcher handles both details:
it uses a short-lived ownership initializer for the mount root, keeps the main
application process non-root, and explicitly directs zero-config state to
`/var/lib/codex-lb`. The data-directory and exact gateway `/32` are therefore
reserved by this deployment path; other settings from `.env.local` continue to
work normally.

Inspect its runtime metadata with:

```bash
container volume inspect codex-lb-data
```

Apple's container services are per-user launchd agents. At logout, restart, or
shutdown they are terminated without shutting the guest VM down, so an in-flight
write can leave the volume's ext4 filesystem inconsistent. Stop codex-lb before
shutting down the Mac:

```bash
./scripts/apple-container.sh down
```

`container stop codex-lb` also works when you want to keep the container
object. As a safety net, `up` and `restart` check the volume with `e2fsck` from
a short-lived privileged container before starting codex-lb and repair
recoverable errors automatically; the check adds a few seconds to each start.
Starting the container any other way, such as `container start codex-lb` or a
third-party UI's Start button, skips the check.

To update the running checkout:

```bash
git pull
./scripts/apple-container.sh up
```

`up` finishes the new image build before stopping an existing managed
container. If the build fails, the previous instance keeps running. After a
successful build, the replacement reuses `codex-lb-data` and runs the normal
database compatibility checks. The first `up` after upgrading to a checkout
that includes the filesystem check rebuilds the image; until then `restart`
stops with an `e2fsck is missing` message.

Apple Containers does not replace the project's PostgreSQL/Compose topology.
Use [Docker](docker.md) or [Kubernetes](kubernetes.md) when you need PostgreSQL,
multiple replicas, or the Helm deployment contract.

## Troubleshooting

### Apple services do not start

```bash
container system status
container system logs
```

Install or upgrade from Apple's release page if the CLI is older than 1.3. The
script requests the recommended default kernel during service startup.

### The default network gateway cannot be resolved

`up` fails before image build or container replacement if Apple does not report
exactly one valid IPv4 gateway for its `default` network. Any running managed
container and `codex-lb-data` remain untouched. Inspect the runtime directly:

```bash
container network inspect default
container system logs
```

Correct the Apple network or service error and rerun
`./scripts/apple-container.sh up`. The launcher deliberately does not guess a
gateway or fall back to a broad subnet.

### A container named `codex-lb` already exists

The lifecycle script refuses to mutate containers it did not create. Inspect
the conflicting object:

```bash
container inspect codex-lb
```

Rename or remove it only after confirming it is not needed, then rerun `up`.

### Port 2455 or 1455 is already in use

```bash
lsof -nP -iTCP:2455 -sTCP:LISTEN
lsof -nP -iTCP:1455 -sTCP:LISTEN
```

Stop the conflicting local service. The managed path intentionally keeps the
canonical dashboard and OAuth callback ports.

### Volume ownership initialization fails

`up` leaves an existing managed container undeleted and attempts to restart it
when the short-lived volume initializer fails. Inspect the volume and Apple
runtime logs before retrying:

```bash
container volume inspect codex-lb-data
container system logs
```

The script never recursively changes existing data and never resets the volume.

### The data volume fails its filesystem check

`up` and `restart` refuse to start codex-lb when `e2fsck -p` finds errors it
cannot repair without operator input. An existing managed container is left
stopped, nothing is deleted, and the volume is untouched. Back up the volume
image first; `cp -c` makes an instant APFS clone of the file reported by
`container volume inspect codex-lb-data`:

```bash
container volume inspect codex-lb-data
cp -c "$HOME/Library/Application Support/com.apple.container/volumes/codex-lb-data/volume.img" \
  ~/codex-lb-data-volume.img.bak
```

Then repair the filesystem while codex-lb is stopped and start it again:

```bash
container run --rm --user 0 --cap-add CAP_SYS_ADMIN --entrypoint sh \
  --volume codex-lb-data:/mnt codex-lb:apple-local \
  -c 'dev=$(findmnt -n -o SOURCE /mnt) && umount /mnt && e2fsck -f -y "$dev"'
./scripts/apple-container.sh up
```

`e2fsck -y` may move orphaned files into `lost+found` on the volume; check the
dashboard and your accounts after codex-lb is back before deleting the backup.

If the message says that `e2fsck` is missing from the image, run `up` to
rebuild it; `restart` against an image built before the check existed fails
closed by design. If the message says the check could not run and the output
shows `mount failed with errno 117` (`Structure needs cleaning`), the runtime
itself cannot mount the volume, so no container can reach the filesystem.
Repair the image file from the host instead. macOS ships no `e2fsck`, so
install `e2fsprogs` with Homebrew and run it against the backed-up image while
codex-lb is stopped:

```bash
brew install e2fsprogs
"$(brew --prefix e2fsprogs)/sbin/e2fsck" -f -y \
  "$HOME/Library/Application Support/com.apple.container/volumes/codex-lb-data/volume.img"
./scripts/apple-container.sh up
```

`CAP_SYS_ADMIN` is used only by the short-lived check container, never by
codex-lb itself.

### The container starts but never becomes ready

The script prints recent logs and leaves the container plus data volume in
place for diagnosis:

```bash
./scripts/apple-container.sh status
./scripts/apple-container.sh logs
curl -fsS http://127.0.0.1:2455/health/ready
```

Correct the reported source or `.env.local` error and run `up` again. For Apple
runtime failures, add `container system logs` to the diagnosis.

### Codex reports `401` and falls back from WebSockets to HTTPS

This is an authentication/raw-peer problem, not an Apple WebSocket networking
limitation. Both transports use protected proxy routes. With loopback port
publication, Apple presents the Mac to the container as the VM gateway, so an
older container without the lifecycle-owned gateway `/32` rejects both the
WebSocket request and its HTTPS fallback.

Rebuild and recreate the managed object; `restart` alone cannot change its
stored environment:

```bash
./scripts/apple-container.sh up
container network inspect default
container exec codex-lb printenv CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS
```

The printed value should be the currently inspected gateway with `/32`, not a
portable hard-coded address or the full subnet. If API-key authentication is
enabled—or traffic can arrive through a reverse proxy, tunnel, LAN exposure, or
other host relay—configure Codex with a key as described in
[Client Setup](../client-setup.md); the CIDR does not bypass enabled API-key
authentication.

---

*Spec: [deployment-installation](https://github.com/aziddy/codex-lb-for-apple-containers/tree/main/openspec/specs/deployment-installation)*
