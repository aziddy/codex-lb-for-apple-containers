## Why

Apple silicon users can run codex-lb with Apple's native `container` runtime, but the project currently documents only Docker/Compose and leaves users to translate image, port, persistence, and lifecycle semantics themselves. A supported Apple Containers path makes this fork useful without requiring Docker Desktop or an operator-authored launch command. Real-runtime verification also exposed a protected-route gap that readiness alone could not catch: Apple's localhost publication presents the Mac as the VM gateway, so new Codex WebSocket and HTTP requests receive `401` while the unprotected readiness endpoint remains healthy.

## What Changes

- Add a zero-configuration Apple Containers lifecycle command that validates the supported Mac/runtime, starts the local container services when needed, discovers the active default-network IPv4 gateway, builds the existing OCI image for `linux/arm64`, and launches codex-lb on localhost with persistent data.
- Preserve host-local protected proxy access across Apple VM networking by allowing only the discovered gateway's `/32` raw socket peer; do not hard-code Apple's default subnet or broaden the exception to the full VM network.
- Make repeated starts safe: only replace containers created by the lifecycle command, preserve the named data volume, wait for readiness, and surface actionable startup failures.
- Provide build, start/recreate, restart, stop, status, and log operations without introducing a second image definition or application setting surface.
- Add deterministic unit coverage using a fake `container` CLI, plus an operator guide and quick-start links governed by the deployment-installation capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment-installation`: Define the supported, zero-config Apple Containers install and lifecycle contract for a single-replica SQLite deployment on Apple silicon.

## Impact

- Affected areas: `scripts/`, deployment documentation and navigation, quick-start documentation, unit tests, and the deployment-installation OpenSpec capability.
- The existing `Dockerfile` remains the only production image definition and Docker/Helm behavior remains unchanged.
- The new path depends on Apple's `container` CLI on supported Apple silicon/macOS hosts; it adds no Python dependency, new application environment variable, database migration, or public API change. It supplies the existing `CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS` setting as a lifecycle-owned exact-host exception.
