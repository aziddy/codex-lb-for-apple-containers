## Verification evidence

### Automated gates

- `sh -n scripts/apple-container.sh`: passes.
- `.venv/bin/python -m pytest tests/unit/test_apple_container_lifecycle.py -q`: 41 passed (27 pre-existing, 14 new or parametrized cases covering check command shape, `up`/`restart` ordering, repaired results 101-103, uncorrectable 104 on replace, fresh, and restart paths, and tooling failures 0, 1, 108, 227 on both paths).
- `.venv/bin/ruff check` and `ruff format --check` on the test file: clean.
- `git diff --check`: clean.
- `openspec validate --specs`: not run; the checkout still has no `openspec` executable (same open gap as `support-apple-containers` task 4.4).

### Apple runtime smoke (Apple silicon, macOS 26, `container` CLI 1.3.0, 2026-09-15)

- Exit-code propagation: `container run --rm --entrypoint sh python:3.14-slim -c 'exit 103'` returns 103 on the host, so the offset design is observable.
- Migration edge: `restart` against the image built before this change stopped the container, printed `sh: 1: e2fsck: not found` from the guest, then `warning: e2fsck is missing from codex-lb:apple-local; run 'scripts/apple-container.sh up' to rebuild the image.` and `error: codex-lb-data was not verified; codex-lb was left stopped.`
- `up` on the real healthy volume: rebuilt the image (apt layer only), printed `checking codex-lb-data filesystem`, the e2fsck summary line, `codex-lb-data filesystem is clean`, ran the ownership initializer, and reached `/health/ready`; about 34 s wall clock including the cached build. The rebuilt image resolves `/usr/sbin/e2fsck`, `/usr/bin/findmnt`, `/usr/bin/umount`, and `/usr/sbin/debugfs`.
- `restart` on the real volume: stop, check (clean), start, ready in 13 s; `container list --all` shows only `codex-lb` and `buildkit`, so the `--rm` check container leaves no residue.
- Disposable volume `codex-lb-fsck-smoke` with a renamed copy of the script (real container stopped to free the ports):
  - Repair path: created `/victim`, unmounted, `debugfs -w -R "clri <26>"`; `e2fsck -n -f` reported errors; `restart` printed `Entry 'victim' in / (2) has deleted/unused inode 26.  CLEARED.` then `filesystem errors were repaired` and became ready.
  - Fail-closed path: pointed `victimB`'s first extent at `victimA`'s block; `restart` printed the multiply-claimed block report, e2fsck halted with `UNEXPECTED INCONSISTENCY; RUN fsck MANUALLY.`, the script printed the manual recipe and `error: ... was left stopped.`, exit 1, container stopped and undeleted. Running the printed recipe (`e2fsck -f -y`, exit 1) then `restart` reported clean and became ready.
  - Unmountable path: `debugfs -w -R "sif <2> mode 0100644"` made the runtime's own mount fail (`mount failed with errno 117`), so the check container never started; the script reported `could not verify ... (check exited 1)` and left the container stopped. This is why the guide and the warning now point to a host-side `e2fsck` on the volume image for that case; the Homebrew path was not exercised on this host.
  - Cleanup: `down` plus `container volume delete codex-lb-fsck-smoke`; only `codex-lb-data` remains. Real `restart` afterwards: clean, ready, HTTP 200.

## Verification report

| Dimension | Result |
|---|---|
| Completeness | All tasks except strict OpenSpec validation are done; that gate is blocked by the missing executable, as for the parent Apple Containers change. |
| Correctness | Unit tests pin ordering, classification, and both rollback policies; the real runtime confirmed clean, repaired, uncorrectable, unmountable, and stale-image behaviors. |
| Coherence | Delta spec text is identical to the main spec insertion; context and guide describe only behavior the script implements, and the host-side repair is labeled as the escape hatch for the unmountable case. |

Keep this change active until the repository has an approved `openspec` executable and strict validation passes.
