## 1. Apple Containers lifecycle

- [x] 1.1 Add a dependency-free `scripts/apple-container.sh` entry point with platform/CLI preflight, service startup, and `linux/arm64` production-image build operations; verify the script passes POSIX shell syntax checking.
- [x] 1.2 Implement labeled ownership checks, build-before-replace up, restart, down, status, logs, loopback port publication, optional `.env.local`, persistent named storage, and bounded readiness diagnostics; verify command construction and all failure paths through focused tests.
- [x] 1.3 Discover and validate the Apple `default` network's IPv4 gateway before deployment mutation, explicitly attach the workload to that network, then inject the existing unauthenticated-proxy CIDR setting as exactly `<gateway>/32` after `.env.local` so protected localhost Codex traffic remains zero-config.

## 2. Regression coverage

- [x] 2.1 Add unit tests backed by fake host/runtime commands for fresh start, service auto-start, optional env files, repeated managed replacement, unsupported prerequisites, unmanaged conflicts, readiness failure, restart, down, status, and logs; verify the focused pytest file passes on the development host without requiring Apple virtualization.
- [x] 2.2 Add repository contract assertions for the lifecycle script and Apple Containers documentation/spec links; verify the relevant unit-test slice passes.
- [x] 2.3 Add fake-runtime regressions for custom gateway discovery, explicit `--network default`, exact `/32` injection and env-file precedence, plus inspection, missing, malformed, and ambiguous gateway failures that preserve an existing container.

## 3. Specifications and operator documentation

- [x] 3.1 Sync the Apple Containers requirements and stable operational context into `openspec/specs/deployment-installation/`; verify the main spec remains normative and context includes scope, rationale, constraints, failure modes, and a concrete flow.
- [x] 3.2 Add the user-facing Apple Containers deployment guide and update existing quick-start/deployment navigation without adding a README section; verify all new documentation links to the deployment-installation capability and MkDocs renders cleanly.
- [x] 3.3 Document the lifecycle-owned gateway allowlist, its security boundary, per-Mac discovery, API-key interaction, and actionable discovery failures in the delta spec, main spec/context, and Apple operator guide.

## 4. Validation

- [x] 4.1 Run shell syntax, focused unit tests, lint/format, documentation, simplicity-budget, and strict OpenSpec validation; record and resolve every in-scope failure.
- [x] 4.2 Exercise the completed lifecycle entry point against Apple `container` 1.3 on an Apple silicon macOS 26 host, verify `/health/ready`, replacement, persistence, restart, logs/status, and down behavior, then remove only disposable smoke resources.
- [x] 4.3 Recreate the current managed Apple container, verify the discovered gateway `/32` and explicit default-network attachment are present, confirm protected HTTP ingress succeeds, and exercise an actual Codex WebSocket request without the former authentication rejection or HTTPS fallback.
- [ ] 4.4 Run strict OpenSpec validation again after the gateway amendment; keep the change active until the repository has an approved `openspec` executable and this gate passes.
