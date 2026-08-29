## Context

The production image builds and starts successfully with Apple `container` 1.3 on `linux/arm64`, but the runtime differs from Docker in three relevant ways: a new named volume is mounted with a root-owned filesystem root, the guest does not expose Docker's `/.dockerenv` marker, and host loopback publication appears to the application as traffic from the Apple VM gateway's raw socket peer. Without explicit handling, the non-root image user cannot write the mount, application state falls back to its home directory, and protected Codex WebSocket and HTTP requests receive `401` even while the unprotected readiness endpoint remains healthy. The missing layer is therefore lifecycle orchestration that makes service, data-path, ownership, host-gateway trust, and replacement semantics explicit.

The implementation must preserve the existing `Dockerfile` as the image source of truth, keep the application zero-config, avoid a new host dependency, and satisfy the localhost-only and data-preservation requirements in `specs/deployment-installation/spec.md`.

## Goals / Non-Goals

**Goals:**

- Give a supported Mac user one command from a clone to a ready local dashboard.
- Make build-before-replace, container ownership, persistence, and failure diagnostics deterministic.
- Keep Docker, Compose, Helm, application settings, and the image definition unchanged.
- Make lifecycle behavior testable on non-macOS CI without pretending that a fake runtime is an end-to-end smoke test.

**Non-Goals:**

- Orchestrating PostgreSQL or other multi-container Compose profiles.
- Supporting Intel Macs, Rosetta, macOS 15 networking limitations, or Apple `container` releases older than 1.3.
- Publishing a fork-specific prebuilt image, exposing the dashboard beyond loopback, or installing a background restart agent.
- Deleting, resetting, or backing up the persistent volume automatically.

## Decisions

### Use one POSIX shell lifecycle entry point

Add `scripts/apple-container.sh` with `build`, `up`, `restart`, `down`, `status`, `logs`, and `help` operations. POSIX shell is present on every supported Mac and keeps the path dependency-free. A Make target or Python wrapper would add another indirection or require project tooling before the container can start.

Operations that start workloads perform explicit platform and CLI-version checks. `up` starts Apple container services if necessary, performs `container build --platform linux/arm64`, and only then considers replacement of a running deployment. `restart` reuses the existing runtime object and does not rebuild.

### Reuse the production Dockerfile and a local image tag

The lifecycle script builds the root `Dockerfile` into a stable local tag. This proves that the checked-out source is what runs and prevents drift from a second Apple-specific Containerfile. BuildKit cache keeps repeated builds incremental. An upstream registry image was considered, but it would not contain fork changes and would make local source edits surprising.

### Mark ownership before permitting destructive lifecycle actions

The launched container uses the fixed name `codex-lb` and a stable `io.codex-lb.managed-by=apple-container-script` label. Before stop/delete/restart, the script inspects the named object and refuses to mutate an unlabeled conflict. `up` builds first, then gracefully stops and deletes only the managed container. No operation calls a volume-delete or prune command.

The data mount remains `codex-lb-data:/var/lib/codex-lb`, matching Docker documentation. Before the main container starts, a short-lived process from the same image runs as root with `chown` as its entry point and changes only the mount root to `app:app`. It does not recurse into existing data. The main container still uses the Dockerfile's non-root user.

The launcher also sets `CODEX_LB_DATA_DIR=/var/lib/codex-lb` explicitly after loading the optional environment file. This is necessary because Apple guests do not satisfy the application's Docker-specific container heuristic; it is an orchestration override of an existing setting, not a new setting. Pinning the path after `.env.local` prevents an accidental configuration value from silently moving state outside the only persistent mount.

Apple's loopback port publication enters the container VM from the host-side gateway rather than a loopback socket peer. Protected proxy routes therefore classify an otherwise host-local Codex client as remote when API-key authentication is disabled. After services start and before any image or managed-container mutation, `up` inspects Apple's `default` network, extracts and validates exactly one current IPv4 gateway, explicitly attaches the workload to that same network, and supplies the existing `CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS` setting as exactly `<gateway>/32`. The lifecycle override is appended after `.env.local`, like the data-directory override, so a stale or broader file value cannot weaken or break the supported localhost path. The launcher never assumes `192.168.64.1`, never allowlists the full VM subnet, and fails closed when the runtime does not expose one valid IPv4 gateway. A later `up` refreshes the immutable container environment from current network metadata; `restart` deliberately reuses the existing object and its already-resolved environment.

### Prefer secure local defaults and optional existing configuration

Both ports bind to `127.0.0.1`; remote exposure remains governed by the existing remote-deployment documentation rather than a new flag surface. The script passes repository-root `.env.local` only when present. It neither creates nor edits configuration files, so a fresh clone preserves zero-config behavior. The gateway `/32` exception affects only protected proxy routes while global API-key authentication is disabled, and is appropriate only for the shipped loopback-only path with no host relay. It authenticates the Mac-side gateway raw peer, not the original human or client, so a reverse proxy, tunnel, LAN publication, or other host relay must enable API-key authentication. Enabling API-key authentication remains authoritative and still requires a valid key.

### Gate success on the public readiness endpoint

After run or restart, the script polls `http://127.0.0.1:2455/health/ready` for a bounded interval. If the process exits or the deadline expires, it prints recent logs and returns non-zero. This validates migrations, data-directory writability, and HTTP port publication rather than treating a successful VM launch as application readiness.

### Split deterministic contract tests from a real-runtime smoke check

Unit tests place fake `container`, `uname`, `sw_vers`, and `curl` executables first on `PATH`. They assert exact safety properties: prerequisite and gateway-discovery failures do not mutate deployment state, the service is started when needed, the active gateway is validated and narrowed to `/32`, the workload explicitly attaches to the inspected network, lifecycle overrides follow the optional env file, build precedes replacement, the non-recursive ownership initializer precedes the non-root workload, loopback ports and data mount are fixed, and unmanaged conflicts are protected.

The completed lifecycle entry point is also manually smoke-tested with the installed Apple `container` runtime. The check covers a fresh launch, non-root state creation in the named volume, managed replacement, restart, status, logs, readiness, persistence, down, and exact cleanup of disposable resources. CI remains platform-independent and does not claim to exercise Apple's virtualization stack.

## Risks / Trade-offs

- [Apple `container` is evolving and its CLI can change] → Pin the supported baseline to 1.3+, use only documented stable commands, fail fast on older releases, and keep command construction covered by tests.
- [Default network subnets differ across Macs or operator configuration] → Read `status.ipv4Gateway` from `container network inspect default` for each `up`; validate one IPv4 address and scope the exception to that address's `/32` instead of copying a default.
- [Apple changes the network-inspection JSON shape or reports no single IPv4 gateway] → Fail before build or managed-container mutation with the exact inspection command to diagnose; do not guess a gateway or broaden the trust boundary.
- [A host relay can forward non-local traffic through the same trusted gateway peer] → Keep the shipped ports loopback-only, document that the `/32` authenticates the Mac-side relay boundary rather than the original caller, and require API-key authentication before any reverse proxy, tunnel, LAN exposure, or other relay.
- [A local source build is slower than pulling a release image] → Reuse BuildKit cache and provide a separate build operation; correctness for a fork outweighs a hidden dependency on an upstream image.
- [A crash after deleting the old container but before the replacement starts causes downtime] → Complete the fallible image build and volume initialization first, preserve the old image and data volume, and print the exact rerun/log path. If initialization fails, restart the old object without deleting it. Same-host port ownership prevents a true blue/green swap without additional complexity.
- [Fake CLI tests can drift from the real runtime] → Keep a documented real-runtime smoke procedure and validate against the current official command reference when changing the script.
- [Loopback-only publication excludes intentional LAN access] → Preserve the secure local default; operators needing remote access use the existing authenticated remote-deployment path rather than weakening the quick start.

## Migration Plan

This is additive. Existing Docker, Compose, uvx, and Helm users take no action. Apple Containers users run `scripts/apple-container.sh up`; rollback is `scripts/apple-container.sh down`, which removes only the managed container and keeps `codex-lb-data`. Re-running up rebuilds the checked-out revision and reuses that data.
