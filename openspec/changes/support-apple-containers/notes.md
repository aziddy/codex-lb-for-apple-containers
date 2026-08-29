## Verification evidence

### Automated gates

- `sh -n scripts/apple-container.sh`: passed.
- `.venv/bin/python -m pytest tests/unit/test_apple_container_lifecycle.py -q`:
  27 tests
  passed, including custom gateways, explicit network attachment, lifecycle
  override precedence, and fail-closed discovery cases.
- Focused Ruff check and format check for the lifecycle test: passed.
- Proxy architecture and simplicity-budget checks: passed. The final simplicity
  counts are README 144/200 lines, 9/10 top-level headings, `.env.example`
  46/60 lines, core navigation 5/5 items, and 0/0 extra root entries.
- `mkdocs build --strict`: passed.
- `git diff --check` for tracked changes and a direct trailing-whitespace scan
  of new files: passed. The active delta's three requirements and 14 scenarios
  exactly match the Apple Containers section in the main
  `deployment-installation` spec.

Strict OpenSpec validation passed for the original Apple Containers change
before the gateway amendment. It has not been rerun afterward because this
checkout has no local `openspec` executable and external package execution was
not approved. The change remains active with task 4.4 open until that gate can
be rerun; it is not ready to rearchive yet.

### Apple runtime smoke

The completed entry point was exercised on an Apple silicon macOS 26.4 host with
Apple `container` 1.3.0:

- Fresh `up` built the production `linux/arm64` image, initialized
  `codex-lb-data`, launched the main process as UID/GID 1000, and reached HTTP
  200 at `/health/ready`.
- `CODEX_LB_DATA_DIR` resolved to `/var/lib/codex-lb`; `store.db` and
  `encryption.key` were created there by UID/GID 1000, while the ephemeral home
  data path remained absent.
- Repeated `up` replaced only the labeled container. A volume marker and the
  encryption key survived replacement and `restart`, and readiness returned
  HTTP 200 after both operations.
- `status` showed the management label, `arm64/linux`, loopback-only port
  mappings, named volume, non-root image user, and explicit data directory.
  `logs` followed the managed object and stopped without stopping the app.
- A temporary `.env.local` setting was loaded while the lifecycle-owned data
  directory remained pinned to the named mount.
- `down` removed the managed container and preserved the volume. The exact
  disposable volume and two codex-lb smoke images were then deleted, and Apple
  container services were restored to their original stopped state.

The gateway amendment was then exercised against the user's current managed
container on the same host:

- `container network inspect default` reported `192.168.64.1`; `up` discovered
  that value before build, rebuilt the production image, replaced only the
  labeled container, and reused `codex-lb-data`.
- The recreated container is explicitly attached to `default`, has
  `CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=192.168.64.1/32`, and retains
  `CODEX_LB_DATA_DIR=/var/lib/codex-lb`.
- The protected `/backend-api/codex/models` route returned HTTP 200 from raw
  peer `192.168.64.1` without a proxy API key while global API-key auth was
  disabled.
- An ephemeral Codex CLI request using provider `codex-lb` and model
  `gpt-5.6-sol` returned the expected response. Fresh container logs recorded
  `WebSocket /backend-api/codex/responses [accepted]` and contained neither the
  former authentication rejection nor an HTTPS fallback.
- The existing configured account remained usable for the WebSocket request,
  providing a functional check that persistent application state survived the
  replacement.

## Verification report

| Dimension | Result |
|---|---|
| Completeness | 12/13 tasks complete; all implementation/runtime work is done and only post-amendment strict OpenSpec CLI validation remains |
| Correctness | 3/3 requirements and 14/14 scenarios are covered by code, tests, documentation, static spec comparison, or real-runtime evidence |
| Coherence | POSIX launcher, runtime-derived exact-host trust, explicit network coupling, production Dockerfile reuse, non-root runtime, fixed localhost publication, and the OpenSpec documentation model follow the design |

No code, documentation, or live-runtime issue remains. Keep the change active
until task 4.4 passes, then verify and archive it through the normal workflow.
