# Deployment & Installation Context

## Purpose and Scope

This capability owns the install contracts (Helm modes, Compose profiles,
smoke tests) and the operator environment-variable contract at
settings-load time: which `CODEX_LB_*` values exist, which are deliberately
fixed, and how removed settings are retired.

See `openspec/specs/deployment-installation/spec.md` for normative
requirements.

## Nix flake workflow

The root flake is an additive installation and development path for Nix users.
It builds the same `codex-lb` distribution and CLI entry points as the Python
package while deriving dependency versions and hashes from `uv.lock`. The
flake inputs pin nixpkgs, uv2nix, pyproject.nix, and the shared build-system
overlay so a dependency update is an explicit lock-file change.

The package uses pyproject.nix's application wrapper rather than exposing its
internal Python virtual environment. Runtime dependencies are limited to the
project's default dependency set; metrics, tracing, documentation, and
development dependencies stay out of the proxy package. Nix builds the
dashboard from `frontend/bun.lock` and copies the compiled assets into the
Python wheel, matching the existing container and release build. Package source
filtering includes only the backend, frontend build inputs, configuration,
project metadata, license, and readme, so unrelated repository files do not
affect either source hash.

The development shell uses the default runtime dependencies plus the `dev`
dependency group. Documentation tooling and optional metrics and tracing
integrations stay out of the default shell so its closure remains focused. Its
project wheel is editable and points at the checkout through
`REPO_ROOT`; `UV_NO_SYNC=1`, `UV_PYTHON_DOWNLOADS=never`, and the pinned Python
3.13 interpreter keep uv from replacing the Nix-managed environment. Hatch's
editable path loads `editables` dynamically, so the flake supplies that helper
from the pinned build-system overlay as a dev-only build dependency. The
editable derivation hashes only project metadata, package roots, and the small
`config` package, so ordinary application source edits do not invalidate the
development shell.

Supported outputs are AArch64 Darwin, AArch64 Linux, and x86-64 Linux. The
pinned nixpkgs revision has dropped x86-64 Darwin support, so the flake does not
advertise an output that cannot evaluate. A missing compatible wheel or native
library after a lock update is expected to fail during `nix build` or
`nix flake check`, rather than falling back to an unpinned installer.

For example, from a checkout:

```bash
nix run .                 # start the proxy through app.cli:main
nix develop               # enter the editable development shell
nix build                 # build the wrapped codex-lb application
nix flake check           # build the default package
```

`nix run . -- --help` verifies the proxy command without starting the server.
The packaged app reads `.env` and `.env.local` from the directory where it is
launched: the wrapper defaults the `CODEX_LB_ENV_FILE` settings-load override
(an `os.pathsep`-separated path list) to the launch directory because the
packaged module root sits in the read-only Nix store where env files cannot
exist. An operator-provided `CODEX_LB_ENV_FILE` wins, and non-Nix launch
paths keep module-root discovery. Application state still follows the normal
data-directory rules and is never written into the immutable Nix store.

## Timeout Invariant Linter Scope

The timeout invariant linter is a startup `Settings` guardrail. Strict mode is
an opt-in startup or CI failure path for violating startup configuration, not a
general runtime timeout validator.

Validated inputs:

- The `Settings` object materialized at startup.
- Explicitly imported code constants used by the two constant-backed rules:
  model-registry refresh cadence and durable HTTP bridge retry-circuit TTL.

Known non-goals and follow-ups:

- Per-request `ContextVar` overrides are not revalidated. Current anchors:
  `app/core/clients/proxy.py:3450-3467`,
  `app/modules/proxy/_service/streaming/helpers.py:861-868`,
  `app/modules/proxy/_service/compact.py:727-738`,
  `app/modules/proxy/_service/transcribe.py:230-232`,
  `app/core/clients/files.py:77-90`, and
  `app/modules/proxy/service.py:1464-1478`.
- Runtime clamps and derived effective values are not fully modeled. Current
  anchors: `app/core/clients/proxy.py:1049-1088`,
  `app/core/auth/refresh.py:391-395`, and
  `app/modules/proxy/load_balancer.py:1846-1856`.
- Runtime DB, API-key, and model-source settings can affect timeout-bearing
  paths without startup revalidation. Current anchors:
  `app/core/config/settings_cache.py:22-36`,
  `app/modules/settings/api.py:547-710`,
  `app/modules/proxy/_service/streaming/retry.py:153-165`, and
  `app/modules/model_sources/forwarding.py:112-221`.

Example: `python -m app.core.timeout_invariants --strict` validates the
startup `Settings` view and exits nonzero when any enforced rule fails.
Running the same command without `--strict` reports violations but exits zero,
matching the default startup behavior.

`CODEX_LB_TIMEOUT_INVARIANT_VALIDATION_STRICT` is intentionally a setting
rather than a hard default because existing deployments may carry legacy timeout
values that deserve CRITICAL diagnostics first, not surprise startup refusal.
The default remains non-strict; operators and CI opt into fail-fast behavior.

## Helm termination-grace upgrade contract

The graceful-shutdown chart adds a render-time guard:
`terminationGracePeriodSeconds` must be at least
`config.shutdownDrainTimeoutSeconds + 32`. Existing values files, explicit
`--set` arguments, or values retained by `helm upgrade --reuse-values` below
that bound make `helm template`, `helm install`, and `helm upgrade` fail before
resources are applied. A failed upgrade leaves the existing release in place.

With the default 30-second drain timeout, the arithmetic minimum is 62 seconds
and the chart default is 65 seconds. An explicit retained value of 60 seconds,
the previous chart default, is therefore invalid. Before installing or
upgrading, raise every retained low value explicitly to at least the computed
minimum; setting 65 preserves the chart's default helper-launch headroom when
the drain timeout remains 30 seconds. Production overrides should retain
additional headroom for preStop helper launch.

For example, this retained value fails rendering:

```yaml
config:
  shutdownDrainTimeoutSeconds: 30
terminationGracePeriodSeconds: 60
```

When `--reuse-values` is used, removing
`terminationGracePeriodSeconds` from a new values file or omitting its `--set`
argument does not clear the stored 60-second value. That upgrade must set the
key explicitly to at least 62 seconds; setting it to 65 preserves the chart's
three seconds of helper-launch headroom. To adopt the 65-second chart default
without storing an override, use an intentional non-reuse or `--reset-values`
upgrade with `terminationGracePeriodSeconds` absent.

## Raw socket peer preservation and proxy projection

codex-lb captures the incoming ASGI client before delegating once to Uvicorn's
proxy projection. Shipped launchers disable the outer server middleware so raw
transport policy can use the original peer while downstream handlers still see
the projected client and scheme. The `forwarded_allow_ips` setting (env
`FORWARDED_ALLOW_IPS`, alias `CODEX_LB_FORWARDED_ALLOW_IPS`, also loadable from
`.env` files) is the sole trust input and keeps Uvicorn's semantics unchanged.

For example, a TCP peer at `10.0.0.8` may project client `192.168.65.1` and
scheme `https`; raw-peer authorization still evaluates `10.0.0.8`.

## NEXT-RELEASE QUEUE (do not lose)

Work queued for the release after the one that shipped the
settings-surface reduction (issue #1340, phases 1-4 + retention dashboard
settings, merged as PRs #1351, #1360, #1362, #1363, #1364 in v1.21.x):

1. **Drop the deprecated prewarm request-log columns (phase B).**
   `prewarm_canary_bucket` and `prewarm_eligible_reason` have been unwritten
   since phase 4 and are no longer mapped by the `RequestLog` ORM model since
   `retire-prewarm-canary-column-mappings` (v1.25); the physical columns are
   allow-listed in `_LEGACY_EXTRA_COLUMNS` (`app/db/migrate.py`). They could
   not be dropped in the same release that retired the mapping: the Helm
   migration Job runs before old replicas drain, and a previous-release
   replica renders explicit NULLs for every mapped column in its request-log
   INSERTs, so dropping the columns while v1.24 still mapped them would have
   failed its inserts and full-entity reads during the roll. Once v1.25 is the
   oldest supported release, add the Alembic drop revision (batch-mode
   `drop_column` for SQLite, nullable re-add on downgrade) and remove the two
   allow-list entries in the same PR.
2. ~~**Retire the retention env aliases.**~~ Done in
   `remove-dead-env-settings` (first release after v1.24.0): the env fields are gone and
   `CODEX_LB_REQUEST_LOG_RETENTION_DAYS` /
   `CODEX_LB_USAGE_HISTORY_RETENTION_DAYS` are in `_REMOVED_SETTINGS` for
   their warning release. See `openspec/specs/data-retention/context.md`.
3. **Retire the removal warning itself.** `_REMOVED_SETTINGS` and
   `warn_removed_settings()` in `app/core/config/settings.py` are a
   one-release courtesy per removed batch ("at least one release"). The
   phase 1-4 names were pruned by `remove-dead-env-settings` (their warning release shipped in
   v1.22-v1.24); the six names removed by that change, together with
   `CODEX_LB_UPSTREAM_STREAM_TRANSPORT` (`remove-upstream-stream-transport-env`),
   are pruned in the release after the one that ships them. Drop the mechanism
   only once no batch is pending.

## Settings-surface reduction rationale (issue #1340, phases 1-4)

PRINCIPLES.md P2: "a setting the operator never needs to touch is a
default in disguise." The `Settings` class carried 165 env-settable fields
before phase 1; phases 1-4 removed 52 of them (plus adding `CODEX_LB_TRACE`).
Selection rule for every phase: removal is provably zero-risk — each
removed field keeps its exact previous default as the new fixed value, so
behavior is byte-identical for any install that never overrode it, and the
only behavioral seam (the removed-settings warning) is additive.

Capability choice: `deployment-installation` owns the operator env-var
contract at settings-load time (see the data-directory resolution
requirement), so the fixed-constants + removal-warning requirement lives
here rather than in `contribution-simplicity`, which governs the
contribution/review process, not runtime behavior.

### Removed fields by phase

Phase 1 (24 removed, 1 added; zero-risk internals):

- OAuth protocol identity (6): `CODEX_LB_AUTH_BASE_URL`
  (`https://auth.openai.com`), `CODEX_LB_OAUTH_CLIENT_ID`
  (`app_EMoamEEZ73f0CkXaXp7hrann`), `CODEX_LB_OAUTH_ORIGINATOR`
  (`codex_chatgpt_desktop`), `CODEX_LB_OAUTH_SCOPE`
  (`openid profile email`), `CODEX_LB_OAUTH_REDIRECT_URI`
  (`http://localhost:1455/auth/callback`), `CODEX_LB_OAUTH_CALLBACK_PORT`
  (1455) — module constants in `app/core/config/settings.py`; changing any
  of them breaks login.
- Auth guardian tuning (7): interval 21600, max refresh age 43200, batch
  size 100, concurrency 3, jitter 300.0, failure backoff base 300.0 / max
  3600.0 — constants in `app/core/auth/guardian.py`; the single switch
  is the dashboard setting `auth_guardian_enabled`
  (`CODEX_LB_AUTH_GUARDIAN_ENABLED` is a deprecated fallback while the
  dashboard value is unset).
- Debug log booleans (6): the `CODEX_LB_LOG_PROXY_*` /
  `CODEX_LB_LOG_UPSTREAM_*` booleans became `CODEX_LB_TRACE` channels
  (`shape`, `shape_raw_cache_key`, `payload`, `service_tier`,
  `upstream_summary`, `upstream_payload`); empty default = all off. This
  is an incident-debugging knob for interactive use only; there is no
  correct steady-state value other than "off".
- Bulkhead per-class overrides (3): http/websocket/compact limits always
  derive from `CODEX_LB_BULKHEAD_PROXY_LIMIT` (http = websocket = proxy
  limit; compact = min(http, 16), 0 when http is 0).
- Token-refresh claim polling (2): wait 8.0 s, poll 0.25 s — constants in
  `app/modules/accounts/auth_manager.py`.
  `CODEX_LB_TOKEN_REFRESH_CLAIM_TTL_SECONDS` stayed in this phase because
  its floor validation referenced settings that were still configurable;
  `constantize-core-tunables` later fixed those operands too, so the TTL
  is now the code helper `max(30 s, admission wait + 2 x refresh timeout)`
  in `app/modules/accounts/auth_manager.py` (same 30 s result) and the
  env name is removed.

Phase 2 (15 removed):

- Scheduler cadences (4): quota planner tick 300 s (the old
  `max(60, ...)` clamp became moot and was dropped), automations poll
  30 s, model-registry refresh 300 s, sticky-session cleanup 300 s —
  constants next to their scheduler builders; every `*_ENABLED` switch
  remains.
- Codex client fingerprint (3): OS `Mac OS 26.5.0`, arch `arm64`,
  terminal `iTerm.app/3.6.10` — `_FINGERPRINT_*` constants in
  `app/core/clients/proxy.py`, maintained in lockstep with
  `CODEX_LB_MODEL_REGISTRY_CLIENT_VERSION` bumps (which stays a setting:
  it doubles as the degraded-startup catalog floor).
- Live-usage write coalescing (2): min interval 5.0 s, queue size 512 —
  constants in `app/modules/usage/live_ingest.py`.
- Request-log count-cache TTL (1): fixed 30.0 s in
  `app/modules/request_logs/repository.py` (the test suite patches the
  constant to 0 where exact totals matter).
- Circuit-breaker tuning (2): failure threshold 5, recovery timeout 60 s
  — constants in `app/core/resilience/circuit_breaker.py`. The Helm chart
  values `config.circuitBreakerFailureThreshold`,
  `config.circuitBreakerRecoveryTimeoutSeconds`, and
  `config.stickySessionCleanupIntervalSeconds` were removed in the same
  change so a default install does not trip its own removal warning.
- Memory warning threshold (1): derived as 80% of
  `CODEX_LB_MEMORY_REJECT_THRESHOLD_MB` in
  `app/core/resilience/memory_monitor.py`. The warning has no meaning on
  its own — it exists to announce that the reject threshold is being
  approached. The only lost configuration is a warning-only setup with no
  reject threshold, an observability half-measure the log stream covers
  anyway. `CODEX_LB_MEMORY_REJECT_THRESHOLD_MB` stays: it is the one
  genuine deployment decision (it depends on host memory size), default 0
  = fully off.
- Images internals (2): host model fixed to `gpt-5.5`
  (`_IMAGES_HOST_MODEL` in `app/modules/proxy/api.py`; the model registry
  has no "default Responses model" concept, so a documented constant
  tracking the bootstrap catalog beats inventing registry plumbing —
  never echoed to clients) and partial-images cap fixed to 3 in
  `app/core/openai/images.py` (an upstream streaming contract).
  `CODEX_LB_IMAGES_DEFAULT_MODEL` stayed in this phase as the public API
  contract for clients that omit `model`; `constantize-core-tunables`
  later fixed it as `DEFAULT_PUBLIC_IMAGE_MODEL = "gpt-image-2"` in
  `app/core/openai/images.py` (nobody ever pointed it elsewhere, and the
  public default is a contract precisely because it does not move per
  deployment).

Phase 3 (10 removed):

- DB pool tuning (4): background pool size / max overflow always derive
  from `database_pool_size` / `database_max_overflow` (nothing ever set
  the overrides; unconditional derivation also collapses the `background`
  branch out of the engine-kwargs helper so pre-ping/recycle regressions
  like #672 cannot diverge between the two engines); pool checkout
  timeout fixed 30.0 s and recycle window fixed 1800 s
  (`_POSTGRES_POOL_*` constants in `app/db/session.py`).
  `CODEX_LB_DATABASE_POOL_SIZE` / `CODEX_LB_DATABASE_MAX_OVERFLOW` stay:
  PostgreSQL HA operators must budget both independently pooled engines in
  every supported one-worker replica:
  `(pool_size + max_overflow) x 2 x replicas`, while reserving server
  connections for PostgreSQL internals, migrations, and operations. The owned
  CLI launcher pins one worker; custom multi-worker launchers are unsupported.
  The Helm chart pins both pool inputs.
- Soft-drain/probe thresholds (6): drain at 85%/90%, error window 60 s /
  count 2, probe quiet 60 s, success streak 3. They encode the
  deterministic-failover design and interlock — raising one without the
  others degrades failover in non-obvious ways — and
  `app/core/balancer/logic.py` already declared identical constants as
  `evaluate_health_tier` parameter defaults, so the settings were a second
  source of truth for numbers that must not drift. The function keeps its
  full parameter surface for tests; production call sites rely on the
  constant defaults. `CODEX_LB_SOFT_DRAIN_ENABLED` and
  `CODEX_LB_DETERMINISTIC_FAILOVER_ENABLED` stay as the subsystem
  switches.

Phase 4 (3 removed; prewarm canary scaffolding):

- `CODEX_LB_HTTP_RESPONSES_SESSION_BRIDGE_CODEX_PREWARM_CANARY_PERCENT`
  and the `..._ALLOW_API_KEY_IDS` / `..._DENY_API_KEY_IDS` cohort lists
  (plus their validator). The canary machinery was one-time rollout
  instrumentation for a finished experiment, not an operator contract.
  Production was verified live on 2026-07-15 before removal: every
  replica ran `prewarm_enabled=False`, percent unset (`None`), empty
  allow/deny lists — and the `canary_percent=None` code path (treat all
  eligible requests, `legacy_all`) is exactly the new unconditional
  behavior, so nothing changed for defaults or production.
  `..._PREWARM_ENABLED` stays (default off, mid-rollout): enabling it is
  a real operator decision; only the scoping machinery went away.
  `prewarm_status=canary_miss` is unreachable and removed from the
  observability contract; see
  `openspec/specs/proxy-runtime-observability/context.md`.
  If a future feature needs percentage or cohort-scoped rollout, that is
  a new OpenSpec change with its own design — re-introducing these
  settings verbatim is explicitly not the path.

## Deprecation policy for removed settings

`extra="ignore"` on `Settings` makes removed env vars inert the moment the
fields are deleted; the startup WARN (`warn_removed_settings()` in
`app/core/config/settings.py`, called from the `app/main.py` lifespan) is
one release of courtesy so operators notice stale configuration. The
warning lists names only, never values. `_REMOVED_SETTINGS` holds only the
most recent removal batch: once a batch's warning release has shipped its
names are pruned (they stay inert), so the list never accumulates.

### Removed by `remove-dead-env-settings` (first release after v1.24.0)

Six env fields whose documented behavior was already dead or deprecated:

- `CODEX_LB_REQUEST_LOG_RETENTION_DAYS`, `CODEX_LB_USAGE_HISTORY_RETENTION_DAYS`
  — deprecated aliases for the dashboard retention settings since
  v1.21.x; NULL dashboard values are now disabled (`data-retention`).
- `CODEX_LB_HTTP_DOWNSTREAM_TRANSPORT_POLICY`,
  `CODEX_LB_OPENAI_CACHE_AFFINITY_MAX_AGE_SECONDS`, `CODEX_LB_WARMUP_MODEL`
  — only ever copied into the `dashboard_settings` row when it was first
  created, so on every initialized deployment the env value was ignored
  while docs and the Helm chart (`config.cacheAffinityMaxAgeSeconds`,
  removed) presented it as live configuration. The first-created row now
  takes the column defaults (`smart`, `1800`, `gpt-5.4-mini`), which equal
  the former env defaults.
- `CODEX_LB_HTTP_RESPONSES_SESSION_BRIDGE_GATEWAY_SAFE_MODE` — zero
  readers; only the dashboard column was ever consulted.

`CODEX_LB_WORKERS_PER_INSTANCE` was also dropped as a `Settings` field but
is NOT a removed setting: it is a startup guard (only `1` is supported) and
keeps rejecting any other value with the same error
(`proxy-admission-control`).

### Removed by `constantize-core-tunables` (first release after v1.25.0-beta.5)

Twenty-seven never-tuned core tunables from the `MIGRATING` backlog became
fixed constants at their previous defaults (slop-removal 0908, K1; the
triage evidence is per field: definition line unchanged since introduction,
no Helm/.env.example/docs/issue/incident mention, never set in production).
Behaviour is unchanged; each env name gets the one-release WARN.

- Upstream transport: `CODEX_LB_MAX_SSE_EVENT_BYTES` (16 MiB),
  `CODEX_LB_UPSTREAM_RESPONSE_CREATE_MAX_BYTES` (15 MiB, derived from the
  frame budget), `CODEX_LB_UPSTREAM_COMPACT_TIMEOUT_SECONDS` (no constant —
  the dashboard `compact_request_budget_seconds` was already the only total
  cap that ever applied).
- Auth / token refresh: `CODEX_LB_OAUTH_TIMEOUT_SECONDS` (30 s),
  `CODEX_LB_TOKEN_REFRESH_TIMEOUT_SECONDS` (8 s),
  `CODEX_LB_TOKEN_REFRESH_CLAIM_TTL_SECONDS` (helper, 30 s),
  `CODEX_LB_PROXY_REFRESH_FAILURE_COOLDOWN_SECONDS` (5 s),
  `CODEX_LB_PROXY_ADMISSION_WAIT_TIMEOUT_SECONDS` (10 s, single home in
  `app/modules/proxy/work_admission.py`).
- Usage polling: `CODEX_LB_USAGE_FETCH_TIMEOUT_SECONDS` (10 s),
  `CODEX_LB_USAGE_FETCH_MAX_RETRIES` (2), `CODEX_LB_USAGE_REFRESH_ENABLED`
  (always on, including the request-path refreshes),
  `CODEX_LB_USAGE_REFRESH_INTERVAL_SECONDS` (60 s; the 180 s freshness
  horizon is derived in `app/core/usage/refresh_policy.py`),
  `CODEX_LB_USAGE_REFRESH_AUTH_FAILURE_COOLDOWN_SECONDS` (300 s),
  `CODEX_LB_LIVE_USAGE_INGESTION_ENABLED` (always on),
  `CODEX_LB_RATE_LIMIT_RESET_CREDITS_REFRESH_INTERVAL_SECONDS` (60 s).
  `CODEX_LB_RATE_LIMIT_RESET_CREDITS_REFRESH_ENABLED` is NOT in this batch:
  it migrated to the dashboard setting
  `rate_limit_reset_credits_refresh_enabled`
  (`dashboard-managed-background-jobs`), where it joins
  `auth_guardian_enabled` and `automations_scheduler_enabled` under
  Settings → Advanced → Background jobs.
- Scheduler toggles: `CODEX_LB_STICKY_SESSION_CLEANUP_ENABLED`,
  `CODEX_LB_MODEL_REGISTRY_ENABLED` (always on),
  `CODEX_LB_QUOTA_PLANNER_SCHEDULER_ENABLED` (folded into the dashboard
  `quota_planner_settings.mode = "off"`, which already stopped every tick;
  no new column).
- Ingress / images / models: `CODEX_LB_MAX_DECOMPRESSED_BODY_BYTES` (32 MiB)
  and `CODEX_LB_MAX_DECOMPRESSED_RESPONSES_BODY_BYTES` (128 MiB) in
  `app/core/ingress_limits.py`, the same constant that seeds `--ws-max-size`;
  `CODEX_LB_IMAGE_INLINE_FETCH_ENABLED` (always on) and
  `CODEX_LB_IMAGE_INLINE_ALLOWED_HOSTS` (the allowlist was never populated;
  the scheme, literal-host and disallowed-IP SSRF guards stay);
  `CODEX_LB_IMAGES_DEFAULT_MODEL` (`gpt-image-2`);
  `CODEX_LB_OPENAI_PROMPT_CACHE_KEY_DERIVATION_ENABLED` (always on; Helm
  `config.promptCacheKeyDerivationEnabled` removed).
- Process admission gates: `CODEX_LB_PROXY_TOKEN_REFRESH_LIMIT` (64),
  `CODEX_LB_PROXY_UPSTREAM_WEBSOCKET_CONNECT_LIMIT` (128),
  `CODEX_LB_PROXY_COMPACT_RESPONSE_CREATE_LIMIT` (64); every gate always
  exists. `CODEX_LB_PROXY_RESPONSE_CREATE_LIMIT` (256) stays configurable.

Helm also drops `config.stickySessionCleanupEnabled` so a default install
does not trip its own removal warning. `CODEX_LB_TOKEN_REFRESH_INTERVAL_DAYS`
was in the triage batch but is kept: `scripts/traffic_analysis/fast_canary_suite.py`
sets it to `365` in the failure-matrix subprocess to suppress proactive
refresh, a live consumer that constantizing would silently defeat.

## Example

An operator running `CODEX_LB_LOG_UPSTREAM_REQUEST_PAYLOAD=true` upgrades:
startup logs

```
removed setting(s) ignored: CODEX_LB_LOG_UPSTREAM_REQUEST_PAYLOAD — values are now fixed; see PRINCIPLES.md P2 / issue #1340
```

and the equivalent incident-debugging behavior is re-enabled interactively
with `CODEX_LB_TRACE=upstream_payload`. Startup never fails because of a
removed setting, and the fixed built-in value is used.

## Apple Containers local deployment

### Purpose and boundaries

The Apple Containers path gives Apple silicon users a native, Docker
Desktop-free way to run the default single-replica SQLite topology from a
checkout. The normative host, lifecycle, networking, persistence, and
documentation contracts are in the three Apple Containers requirements in
`spec.md`.

This path deliberately does not translate Docker Compose. The default app is
one container with SQLite, so a small repository-owned lifecycle script is
more direct and auditable than a general Compose compatibility layer. The
PostgreSQL profiles, multi-replica deployments, Intel/Rosetta hosts, pre-macOS
26 networking, LAN exposure, and background login-item management remain out
of scope; Docker/Helm and the authenticated remote-access guide continue to
own those cases.

### Decisions and constraints

`scripts/apple-container.sh` reuses the production `Dockerfile` and builds a
local `linux/arm64` image. That keeps checked-out source and the running image
in lockstep and avoids a second Apple-specific image definition. The script
depends only on the supported host's POSIX shell, Apple `container`, and
`curl`; application dependencies remain inside the image.

The runtime object is fixed to `codex-lb`, tagged with
`io.codex-lb.managed-by=apple-container-script`, and published only on
`127.0.0.1:2455` and `127.0.0.1:1455`. A same-name object without that label is
treated as someone else's container and is never stopped or deleted. The data
mount is the reusable Apple named volume `codex-lb-data` at
`/var/lib/codex-lb`; lifecycle operations never invoke volume deletion or
pruning. Apple creates the mount root as `root:root`, so `up` uses a short-lived
root process from the production image to change only that directory to
`app:app`; the application itself keeps the image's non-root user. Because the
Apple guest also lacks Docker's `/.dockerenv` marker, the main launch explicitly
sets `CODEX_LB_DATA_DIR=/var/lib/codex-lb` after loading any repository-root
`.env.local`. This guarantees that zero-config state reaches the persistent
mount rather than the container VM's ephemeral home directory.

Apple's loopback publication crosses the VM boundary, so the application sees
the Mac-side IPv4 gateway as the raw socket peer rather than `127.0.0.1`.
Protected proxy routes use that raw peer for their local/no-key decision. On
each `up`, the launcher therefore inspects `container network inspect default`,
requires exactly one valid `status.ipv4Gateway`, explicitly attaches the
workload to that same `default` network, and appends
`CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=<gateway>/32` after `.env.local`.
The ordering makes this exact-host value lifecycle-owned: a file value cannot
replace it with a stale address or a broader subnet.

For example, the development Mac reported `192.168.64.1`, so its container
received `192.168.64.1/32`. That address is observed evidence, not a portable
constant; another Mac or a customized Apple runtime network may use a different
gateway. The launcher never authorizes the full VM subnet.

The `/32` authenticates the Mac-side relay boundary, not the original client.
It is appropriate only while the shipped ports remain loopback-only and no
host reverse proxy, tunnel, LAN publication, or other relay is present. Those
deployment shapes must enable API-key authentication, which remains
authoritative over the CIDR exception and still requires a valid key.

After gateway discovery succeeds, `up` builds before it stops an existing
managed instance. This intentionally keeps the previous process serving if
network inspection, compilation, or dependency download fails. A same-port
local replacement cannot be fully blue/green, so a failure after the old
process stops can still cause downtime; the preserved image and volume make
recovery another `up` invocation rather than a data migration.

### Unclean host shutdown and the volume check

Apple's container services (`container-apiserver`, the network and image
helpers, and one runtime helper per running container) are per-user launchd
agents. When the user logs out or the Mac restarts or shuts down, launchd sends
SIGTERM to all of them at once and kills the API server after its five-second
exit timeout; nothing shuts the guest VM down first. On 2026-09-14 a normal
macOS shutdown while codex-lb was running left the `codex-lb-data` ext4 image
with a directory entry for SQLite's `store.db-shm` pointing at a deleted inode
and stale block and inode bitmaps. The next start failed inside the entrypoint's
migration step with `sqlite3.OperationalError: unable to open database file`,
because opening a WAL-mode database also opens the `-shm` file. SQLite's
write-ahead log kept `store.db` itself consistent; the damage was confined to
guest filesystem metadata and `e2fsck -p` cleared it in seconds.

`up` and `restart` therefore check the volume before every start. Apple
presents a named volume only as an already-mounted filesystem and `e2fsck`
needs the unmounted block device, so the check runs from a short-lived root
container built from the production image with `CAP_SYS_ADMIN` added: the guest
resolves the device from the mount table, unmounts the volume, and runs
`e2fsck -p -f`. Preen mode applies only fixes that are safe without operator
judgement, and `-f` is required because the incident volume mounted "clean" and
only failed on access. The application container never receives the
capability. Shipping `e2fsprogs` in the shared runtime image costs a few
megabytes and one more package in the Trivy surface; a separate helper image
would have avoided that at the price of a second build and tag to manage.

The guest reports e2fsck's status offset by 100. e2fsck exits 1 for "errors
corrected" and Apple's CLI also exits 1 for its own failures, so plain
propagation could report a repair that never happened, and a runtime that
swallowed exit codes would report "clean" forever. The host trusts only 100
through 107 and 227 (e2fsck absent) and treats everything else, including 0,
as "could not verify".

Failure handling is split by outcome. Errors that preen refuses to correct
fail closed: `up` and `restart` neither initialize, delete, create, nor start
codex-lb and leave an existing container stopped, because writing to a
filesystem with stale bitmaps can allocate the same blocks twice and the manual
repair needs exclusive access. A check that could not run says nothing about
the volume, so `up` restarts a container it had stopped, the same rollback the
ownership initializer uses, while `restart` fails with the status and the
rebuild hint; that hint also covers an image built before the check existed.
A host-side graceful stop (a login item that stops the container in its quit
handler) would prevent the damage rather than repair it and is a separate
change; a plain LaunchAgent that traps SIGTERM races the API server's kill and
is not reliable.

### Concrete flow

On a supported fresh Mac:

```bash
./scripts/apple-container.sh up
open http://localhost:2455
```

The command checks the host and CLI, starts Apple container services (including
the default kernel install when needed), resolves the current `default` network
gateway, builds the image, checks and repairs the `codex-lb-data` filesystem,
initializes its mount root, launches the non-root application on that network
with its data path and gateway `/32` pinned, and polls `/health/ready`. A successful readiness response proves the
database path is writable and the published application port works; VM
creation alone is not treated as success. Protected HTTP and WebSocket traffic
must be exercised separately because readiness is intentionally unprotected.

Running `up` again rebuilds and replaces only the labeled container while
reusing its data and refreshing the gateway-derived environment. `restart`
skips both discovery and build because it reuses the existing immutable
container configuration, but it still checks the volume before starting it;
after changing Apple's default network, run `up`.
`down` removes the labeled container but preserves `codex-lb-data`; `status`
and `logs` are read-only inspection paths.

### Failure modes and recovery

- An unsupported CPU, macOS release, or pre-1.3 CLI fails before build or
  container mutation. Upgrade the host/runtime rather than forcing a degraded
  compatibility path.
- A stopped Apple container service is started automatically for lifecycle
  operations. If service or kernel startup fails, use `container system status`
  and `container system logs` before retrying.
- A failed `container network inspect default`, or a missing, malformed, or
  ambiguous IPv4 gateway, stops `up` before image build or container mutation.
  Inspect the command output and Apple system logs, correct the runtime network,
  then rerun `up`; any existing managed container and named volume remain
  intact.
- A `codex-lb` name collision without the management label fails closed. The
  operator decides whether to rename or explicitly remove that unrelated
  object.
- A volume ownership initialization failure leaves an existing managed object
  undeleted and attempts to restart it when it was previously running. Inspect
  the named volume and Apple system logs, then rerun `up`; no recursive
  ownership rewrite or volume reset is performed automatically.
- A volume filesystem check that finds uncorrectable errors leaves an existing
  managed object stopped and undeleted, leaves the volume untouched, and prints
  the manual `e2fsck -f -y` recipe; back up the volume image, repair it, then
  rerun `up`. A check that could not run (for example `e2fsck` missing from an
  image built before the check existed) restarts a container `up` had stopped
  and fails; rerun `up` to rebuild. When the damage is severe enough that the
  runtime cannot mount the volume at all (`mount failed with errno 117`), the
  check container never starts and the same "could not verify" path applies;
  no container can reach that filesystem, so the guide documents a host-side
  `e2fsck` on the volume image via Homebrew `e2fsprogs`.
- An application exit or readiness timeout prints recent logs and leaves both
  the failed container and `codex-lb-data` available for inspection. After
  correcting `.env.local` or the checked-out source, rerun `up`.
- Port conflicts appear during runtime launch. Free localhost ports 2455 and
  1455; the supported quick path does not silently choose ports that would
  break the dashboard or OAuth callback contract.

Development verification on Apple `container` 1.3 first exposed the three
runtime differences above, then exercised the completed lifecycle entry point
with a disposable named volume: default state files were created under the
mount by UID/GID 1000, the inspected gateway was injected as an exact `/32`,
protected HTTP and WebSocket ingress succeeded, `/health/ready` returned HTTP
200, and a marker survived replacement and restart. The volume check was
verified the same way on a disposable named volume: a directory entry cleared
with `debugfs clri` (the incident's exact damage) was repaired by `restart`
in preen mode and the container became ready; multiply-claimed blocks made
preen halt with `RUN fsck MANUALLY`, `restart` printed the manual recipe and
left the container stopped, and the recipe followed by `restart` recovered it;
a root inode rewritten as a regular file made the runtime's own mount fail
with `errno 117`, which surfaced as "could not verify" with the container left
stopped. On the real 512 GB sparse volume the check added roughly two seconds
to `restart`. Platform-independent unit tests separately ratchet gateway
parsing, command ordering, check-result classification, and destructive-action
guards; they do not claim to emulate Apple's virtualization stack.
