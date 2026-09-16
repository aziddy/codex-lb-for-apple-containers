## ADDED Requirements

### Requirement: Apple Containers start operations verify the data volume filesystem

After any existing managed container has been stopped and before the up or restart operation initializes, creates, or starts codex-lb, the lifecycle command MUST run a non-interactive ext4 check (`e2fsck -p -f`) against the block device backing `codex-lb-data` from a short-lived root container that unmounts the volume first. The check MUST use the production image, which MUST ship `e2fsprogs`, and the Linux capability granted to the check container MUST NOT be granted to the application container.

The operation MUST continue only when the check reports a clean filesystem or automatically corrected errors, and MUST report which outcome occurred. When the check reports errors it could not correct, the operation MUST NOT initialize, delete, create, or start codex-lb, MUST leave an existing managed container stopped, and MUST exit non-zero with manual-repair guidance. When the check cannot run or does not produce an e2fsck result, the operation MUST NOT start codex-lb and MUST exit non-zero with the observed status; the up operation MAY restart a managed container it stopped. The check MUST NOT delete, reset, or prune the volume.

#### Scenario: Clean volume is verified before every start

- **GIVEN** a managed codex-lb container whose `codex-lb-data` filesystem is consistent
- **WHEN** the operator runs up or restart
- **THEN** the managed container is stopped before the filesystem check runs
- **AND** up runs the check after the image build and before the ownership initializer and the replacement launch
- **AND** restart runs the check before starting the existing container
- **AND** the command reports that the filesystem is clean and codex-lb becomes ready

#### Scenario: Recoverable errors after an unclean host shutdown are repaired

- **GIVEN** the Mac was shut down or the Apple container services were killed while codex-lb was running
- **AND** the `codex-lb-data` filesystem holds inconsistencies that `e2fsck -p` can correct, such as a directory entry that references a deleted inode
- **WHEN** the operator runs up or restart
- **THEN** the check repairs the filesystem without operator input
- **AND** the command reports that errors were repaired
- **AND** codex-lb starts and becomes ready

#### Scenario: Uncorrectable errors fail closed

- **GIVEN** a running managed codex-lb container
- **AND** the `codex-lb-data` filesystem holds errors that `e2fsck -p` refuses to correct
- **WHEN** the operator runs up or restart
- **THEN** the operation exits non-zero with guidance that names the volume and the manual `e2fsck` repair command
- **AND** the managed container is neither deleted nor restarted
- **AND** no ownership initializer or replacement launch runs
- **AND** the volume is left intact for manual repair

#### Scenario: Check cannot run

- **GIVEN** a running managed codex-lb container
- **AND** the check container cannot start, or the image lacks `e2fsck`, or the check exits without an e2fsck result
- **WHEN** the operator runs up
- **THEN** the operation exits non-zero with the observed status and rebuild guidance
- **AND** the previously running container is restarted rather than deleted
- **AND** when the operator runs restart instead, the container is left stopped with the same guidance

#### Scenario: Operator guidance explains unclean shutdown recovery

- **WHEN** an operator reads the Apple Containers guide
- **THEN** it states that Apple's container services stop at logout or shutdown without shutting the guest down
- **AND** it recommends stopping codex-lb before shutting down the Mac
- **AND** it explains that starting codex-lb outside the lifecycle command skips the check
- **AND** it provides the manual repair recipe for uncorrectable errors
