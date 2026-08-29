## ADDED Requirements

### Requirement: Apple Containers provides a zero-config local install path

The project SHALL provide a repository-owned lifecycle command for a single-replica SQLite deployment using Apple `container` on Apple silicon with macOS 26 or newer and `container` CLI 1.3 or newer. The command MUST start the Apple container services when they are not running, build the repository's existing production `Dockerfile` for `linux/arm64`, launch the application without requiring an environment file, and wait until the readiness endpoint succeeds before reporting success.

The default launch MUST publish application port `2455` and OAuth callback port `1455` only on `127.0.0.1`. It MUST mount the named volume `codex-lb-data` at `/var/lib/codex-lb`, explicitly set `CODEX_LB_DATA_DIR=/var/lib/codex-lb`, and make the mount root writable by the image's non-root `app` user before application startup. Any elevated ownership initializer MUST change only the mount root and MUST NOT make the application process run as root.

After Apple container services are available and before building the image or mutating an existing container, the up operation MUST inspect the runtime's `default` network and resolve exactly one syntactically valid IPv4 gateway. The launch MUST explicitly attach the workload to that same `default` network and pass `CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=<gateway>/32` to the main application process so the shipped loopback-only, no-relay path retains localhost no-key behavior through Apple's VM gateway. The gateway MUST be derived from the active runtime network on every up operation; the launcher MUST NOT hard-code a known default gateway or authorize the full runtime subnet. If gateway inspection fails or produces a missing, malformed, or ambiguous value, the operation MUST fail before image build or container stop, delete, or run actions and MUST preserve any existing managed container and `codex-lb-data` volume.

When `.env.local` exists at the repository root, the launch MUST pass that file to the runtime; when it does not exist, the launch MUST retain the application's zero-config defaults. The lifecycle-owned data-directory and exact gateway `/32` values MUST be passed after the optional environment file so conflicting file values cannot move state outside the persistent mount or broaden unauthenticated proxy access.

#### Scenario: Fresh supported Mac starts with one command

- **GIVEN** an Apple silicon Mac running macOS 26 or newer with `container` CLI 1.3 or newer
- **AND** the Apple container services are stopped
- **AND** `.env.local` is absent
- **WHEN** the operator runs the Apple Containers up command
- **THEN** the command starts the Apple container services
- **AND** resolves the active default network's IPv4 gateway
- **AND** builds the production image for `linux/arm64`
- **AND** initializes the named volume root for the non-root image user
- **AND** launches codex-lb on the inspected `default` network with localhost ports `2455` and `1455` and persistent named storage
- **AND** authorizes only the resolved gateway `/32` for unauthenticated host-local proxy traffic
- **AND** directs the SQLite database, encryption key, and derived state paths into that storage
- **AND** reports the dashboard URL only after `/health/ready` succeeds

#### Scenario: Application state is persisted without a root application process

- **GIVEN** Apple `container` creates `codex-lb-data` with a root-owned mount point
- **WHEN** the operator runs the Apple Containers up command
- **THEN** a short-lived initializer changes ownership of `/var/lib/codex-lb` without recursively changing existing data
- **AND** the main application runs as the image's non-root `app` user
- **AND** the application creates its default state under `/var/lib/codex-lb`

#### Scenario: Optional environment file is honored

- **GIVEN** a supported Apple Containers host
- **AND** `.env.local` exists at the repository root
- **WHEN** the operator runs the up command
- **THEN** the runtime receives `.env.local` through its environment-file interface
- **AND** the launcher-owned data-directory and exact gateway `/32` values take precedence over conflicting file values
- **AND** the published ports and persistent data mount remain unchanged

#### Scenario: Configured default network remains portable

- **GIVEN** the Apple runtime's active default network uses an IPv4 gateway other than a previously observed default
- **WHEN** the operator runs the up command
- **THEN** the launcher derives the current gateway from the runtime metadata
- **AND** explicitly attaches the workload to the inspected `default` network
- **AND** passes only that gateway with a `/32` prefix to `CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS`
- **AND** does not authorize the remaining default-network subnet

#### Scenario: Protected localhost proxy traffic crosses the Apple gateway

- **GIVEN** global proxy API-key authentication is disabled
- **AND** the launcher ports remain bound to loopback with no host relay
- **AND** the launcher has authorized only the inspected `default` network gateway `/32`
- **WHEN** a host-local Codex client sends protected HTTP or WebSocket traffic through the loopback publication
- **THEN** codex-lb accepts the raw gateway peer without a proxy API key
- **AND** enabling global proxy API-key authentication still requires the client to present a valid key
- **AND** an operator MUST enable API-key authentication before adding a reverse proxy, tunnel, LAN publication, or other host relay

#### Scenario: Gateway discovery fails before deployment mutation

- **GIVEN** default-network inspection fails or returns a missing, malformed, or ambiguous IPv4 gateway
- **WHEN** the operator runs the up command
- **THEN** the command exits non-zero with an actionable network-inspection error
- **AND** it does not build, stop, delete, or run a container
- **AND** any existing managed container and `codex-lb-data` volume remain intact

#### Scenario: Unsupported host fails before deployment mutation

- **GIVEN** the host is not macOS 26 or newer on Apple silicon, or its `container` CLI is older than 1.3
- **WHEN** the operator invokes an operation that creates or starts codex-lb
- **THEN** the command exits non-zero with the unmet prerequisite
- **AND** it does not build, stop, delete, or run a container

#### Scenario: Startup failure is actionable

- **GIVEN** the image builds but the launched container never becomes ready
- **WHEN** the readiness deadline expires or the container exits
- **THEN** the command exits non-zero
- **AND** prints recent container logs or an equivalent diagnostic command
- **AND** preserves `codex-lb-data`

### Requirement: Apple Containers lifecycle operations preserve ownership and data

The lifecycle command MUST identify the container it creates with a stable management label. Recreate and removal operations MUST act only on a container with both the expected name and management label. A conflicting container without that label MUST be left untouched and produce an actionable error.

The up operation MUST finish a successful image build before it stops or deletes an existing managed container. Recreate, restart, and down operations MUST preserve the `codex-lb-data` volume. The command SHALL expose build, up, restart, down, status, and logs operations through one entry point.

#### Scenario: Repeated up replaces only the managed container

- **GIVEN** a running container created by the lifecycle command
- **WHEN** the operator runs up again
- **THEN** a successful image build completes before the old container is stopped
- **AND** the old managed container is stopped and replaced
- **AND** the replacement reuses `codex-lb-data`

#### Scenario: Ownership initialization failure preserves the previous container

- **GIVEN** a running container created by the lifecycle command
- **AND** the volume ownership initializer fails after a successful image build
- **WHEN** the operator runs up again
- **THEN** the previous container is not deleted
- **AND** the command attempts to restart it before returning an actionable error

#### Scenario: Conflicting unmanaged container is protected

- **GIVEN** a container has the expected codex-lb name but lacks the lifecycle command's management label
- **WHEN** the operator runs up, restart, or down
- **THEN** the operation exits non-zero with conflict guidance
- **AND** does not stop or delete that container

#### Scenario: Down preserves application data

- **GIVEN** a managed codex-lb container and populated `codex-lb-data` volume
- **WHEN** the operator runs down
- **THEN** the managed container is stopped and deleted
- **AND** the named volume and its contents remain available for the next up operation

#### Scenario: Status and logs use the managed runtime object

- **GIVEN** the lifecycle command has created codex-lb
- **WHEN** the operator runs status or logs
- **THEN** the requested information comes from the labeled codex-lb container
- **AND** neither operation mutates the container or volume

### Requirement: Apple Containers operator guidance is discoverable and spec-linked

The published documentation MUST include an Apple Containers guide covering supported host/runtime versions, the one-command start path, lifecycle operations, localhost ports, `.env.local` behavior, runtime gateway discovery and its exact `/32` security boundary, API-key authentication interaction, persistent-volume behavior, upgrade/rebuild behavior, and startup troubleshooting including protected-route `401` responses and WebSocket-to-HTTPS fallback. Quick-start and deployment navigation MUST link to that guide, and the guide MUST link back to the `deployment-installation` OpenSpec capability.

#### Scenario: Apple silicon user finds the supported path

- **WHEN** a user reads the project quick start or deployment navigation
- **THEN** Apple Containers is presented as a supported macOS deployment path
- **AND** the linked guide provides copyable commands and the governing OpenSpec link
