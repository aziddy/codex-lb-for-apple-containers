## 1. Image

- [x] 1.1 Add `e2fsprogs` to the production `Dockerfile` runtime stage's install list; verify the Apple-built `codex-lb:apple-local` image resolves `e2fsck`, `findmnt`, and `umount`.

## 2. Lifecycle script

- [x] 2.1 Add a `check_volume` step that runs a short-lived root container with `CAP_SYS_ADMIN` from the production image, unmounts `codex-lb-data`, runs `e2fsck -p -f` on its block device, and reports the status offset by 100; verify `sh -n` passes and the guest program has no host-side expansion.
- [x] 2.2 Wire the check into `up` after the managed container is stopped and before the ownership initializer on both the replace and fresh paths, and into `restart` before `container start`; verify ordering through the fake-runtime tests.
- [x] 2.3 Fail closed on uncorrected errors with manual-repair guidance and a stopped, undeleted container; restart a previously running container on `up` only when the check itself could not run; leave `restart` stopped in both cases; verify each path through the fake-runtime tests.

## 3. Regression coverage

- [x] 3.1 Teach the fake `container` CLI a `--cap-add CAP_SYS_ADMIN` run branch with a `FAKE_VOLUME_CHECK_EXIT` knob and require the check before the ownership initializer; verify existing tests still pass with the default clean result.
- [x] 3.2 Add tests for the check command shape, `up` and `restart` ordering, repaired results, uncorrectable results on replace, fresh, and restart paths, and tooling failures including a non-propagating `0`; verify the focused pytest file passes.
- [x] 3.3 Extend the repository contract test to pin `e2fsprogs` in the runtime stage, the check flags in the script, the troubleshooting section in the guide, and the new requirement in the main spec; verify it passes.

## 4. Specifications and operator documentation

- [x] 4.1 Add the delta requirement and scenarios, then sync them into `openspec/specs/deployment-installation/spec.md`; verify the main spec text matches the delta.
- [x] 4.2 Add unclean-shutdown rationale, the offset-status decision, the fail-closed split, the updated concrete flow, and a failure-mode bullet to the capability `context.md`; verify it stays free of normative duplication.
- [x] 4.3 Update `docs/deployment/apple-containers.md`: quick-start steps, restart row, stop-before-shutdown guidance, bypass warning, upgrade note, and a manual-repair troubleshooting section; verify the page keeps its OpenSpec backlink and adds no README section.

## 5. Validation

- [x] 5.1 Run the focused unit tests, ruff check/format, `sh -n`, and `git diff --check`; record results in `notes.md`.
- [x] 5.2 On the Apple silicon host, run `up` against the existing healthy volume and then `restart`; verify the check reports clean, codex-lb becomes ready, the check container leaves no residue, and note the check duration.
- [x] 5.3 On a disposable volume, corrupt a directory entry with `debugfs` and verify `restart` repairs it and becomes ready; create multiply-claimed blocks and verify `restart` fails closed with the printed recipe, the recipe repairs it, and `restart` succeeds; confirm an unmountable volume surfaces as "could not verify"; remove only the disposable resources.
- [ ] 5.4 Run strict OpenSpec validation; the repository still has no approved `openspec` executable (see `support-apple-containers` task 4.4), so keep this change active until that gate passes.
