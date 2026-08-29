from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SOURCE_SCRIPT = _REPO_ROOT / "scripts" / "apple-container.sh"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


@dataclass(frozen=True)
class FakeAppleContainerRuntime:
    project_root: Path
    state_dir: Path
    command_log: Path
    environment: dict[str, str]

    @property
    def script(self) -> Path:
        return self.project_root / "scripts" / "apple-container.sh"

    def run(self, command: str, **environment: str) -> subprocess.CompletedProcess[str]:
        run_environment = self.environment | environment
        return subprocess.run(
            [str(self.script), command],
            cwd=self.project_root,
            env=run_environment,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=20,
        )

    def commands(self) -> list[str]:
        if not self.command_log.exists():
            return []
        return self.command_log.read_text(encoding="utf-8").splitlines()

    def set_system_running(self) -> None:
        (self.state_dir / "system-running").touch()

    def set_container(self, *, managed: bool, running: bool) -> None:
        (self.state_dir / "container-exists").touch()
        if managed:
            (self.state_dir / "container-managed").touch()
        if running:
            (self.state_dir / "container-running").touch()


@pytest.fixture
def fake_runtime(tmp_path: Path) -> FakeAppleContainerRuntime:
    project_root = tmp_path / "project"
    script_dir = project_root / "scripts"
    fake_bin = tmp_path / "bin"
    state_dir = tmp_path / "state"
    command_log = tmp_path / "commands.log"
    script_dir.mkdir(parents=True)
    fake_bin.mkdir()
    state_dir.mkdir()

    shutil.copy2(_SOURCE_SCRIPT, script_dir / "apple-container.sh")
    copied_script = script_dir / "apple-container.sh"
    copied_script.write_text(
        copied_script.read_text(encoding="utf-8").replace("READY_ATTEMPTS=90", "READY_ATTEMPTS=3"),
        encoding="utf-8",
    )
    copied_script.chmod(0o755)
    (project_root / "Dockerfile").write_text("FROM scratch\n", encoding="utf-8")

    _write_executable(
        fake_bin / "uname",
        """#!/bin/sh
case ${1:-} in
  -s) printf '%s\n' "${FAKE_UNAME_SYSTEM:-Darwin}" ;;
  -m) printf '%s\n' "${FAKE_UNAME_MACHINE:-arm64}" ;;
  *) exit 2 ;;
esac
""",
    )
    _write_executable(
        fake_bin / "sw_vers",
        """#!/bin/sh
[ "${1:-}" = "-productVersion" ] || exit 2
printf '%s\n' "${FAKE_MACOS_VERSION:-26.1}"
""",
    )
    _write_executable(
        fake_bin / "sleep",
        """#!/bin/sh
printf 'sleep %s\n' "$*" >> "${FAKE_COMMAND_LOG}"
""",
    )
    _write_executable(
        fake_bin / "curl",
        """#!/bin/sh
set -eu
printf 'curl %s\n' "$*" >> "${FAKE_COMMAND_LOG}"
count_file="${FAKE_STATE_DIR}/curl-count"
count=0
if [ -f "${count_file}" ]; then
  count=$(cat "${count_file}")
fi
count=$((count + 1))
printf '%s\n' "${count}" > "${count_file}"
[ "${count}" -gt "${FAKE_CURL_FAILURES:-0}" ]
""",
    )
    _write_executable(
        fake_bin / "container",
        """#!/bin/sh
set -eu

printf 'container %s\n' "$*" >> "${FAKE_COMMAND_LOG}"
exists="${FAKE_STATE_DIR}/container-exists"
running="${FAKE_STATE_DIR}/container-running"
managed="${FAKE_STATE_DIR}/container-managed"
system_running="${FAKE_STATE_DIR}/system-running"

case ${1:-} in
  --version)
    printf '%s\n' "${FAKE_CONTAINER_VERSION:-container CLI version 1.3.0 (build: release, commit: test)}"
    ;;
  system)
    case ${2:-} in
      status)
        [ -f "${system_running}" ]
        ;;
      start)
        touch "${system_running}"
        ;;
      *)
        exit 2
        ;;
    esac
    ;;
  network)
    [ "${2:-}" = "inspect" ] || exit 2
    [ "${3:-}" = "default" ] || exit 2
    [ "${FAKE_NETWORK_INSPECT_FAILURE:-0}" != 1 ] || exit 45
    case ${FAKE_NETWORK_GATEWAY_MODE:-valid} in
      valid)
        printf '[{"status":{"ipv4Gateway":"%s","ipv4Subnet":"192.168.64.0/24"}}]\n' \
          "${FAKE_NETWORK_GATEWAY:-192.168.64.1}"
        ;;
      missing)
        printf '%s\n' '[{"status":{"ipv4Subnet":"192.168.64.0/24"}}]'
        ;;
      malformed)
        printf '%s\n' '[{"status":{"ipv4Gateway":"192.168.64.999"}}]'
        ;;
      multiple)
        printf '%s\n' \
          '[{"status":{"ipv4Gateway":"192.168.64.1"}},{"status":{"ipv4Gateway":"192.168.64.2"}}]'
        ;;
      *)
        exit 2
        ;;
    esac
    ;;
  build)
    [ "${FAKE_BUILD_FAILURE:-0}" != 1 ] || exit 42
    printf '%s\n' codex-lb:apple-local
    ;;
  list)
    case " $* " in
      *" --all "*) [ ! -f "${exists}" ] || printf '%s\n' codex-lb ;;
      *) [ ! -f "${running}" ] || printf '%s\n' codex-lb ;;
    esac
    ;;
  inspect)
    [ -f "${exists}" ] || exit 1
    if [ -f "${managed}" ]; then
      printf '%s\n' '{"configuration":{"labels":{"io.codex-lb.managed-by":"apple-container-script"}}}'
    else
      printf '%s\n' '{"configuration":{"labels":{}}}'
    fi
    ;;
  run)
    case " $* " in
      *" --entrypoint chown "*)
        [ "${FAKE_VOLUME_INIT_FAILURE:-0}" != 1 ] || exit 43
        touch "${FAKE_STATE_DIR}/volume-initialized"
        ;;
      *)
        [ -f "${FAKE_STATE_DIR}/volume-initialized" ] || exit 44
        touch "${exists}" "${running}" "${managed}"
        printf '%s\n' codex-lb
        ;;
    esac
    ;;
  stop)
    rm -f "${running}"
    ;;
  start)
    [ -f "${exists}" ] || exit 1
    touch "${running}"
    ;;
  delete)
    rm -f "${exists}" "${running}" "${managed}"
    ;;
  logs)
    printf '%s\n' 'fake codex-lb logs'
    ;;
  *)
    exit 2
    ;;
esac
""",
    )

    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "FAKE_COMMAND_LOG": str(command_log),
            "FAKE_STATE_DIR": str(state_dir),
        }
    )
    return FakeAppleContainerRuntime(
        project_root=project_root,
        state_dir=state_dir,
        command_log=command_log,
        environment=environment,
    )


def _index(commands: list[str], prefix: str) -> int:
    return next(index for index, command in enumerate(commands) if command.startswith(prefix))


def _main_run_index(commands: list[str]) -> int:
    return next(
        index
        for index, command in enumerate(commands)
        if command.startswith("container run ") and " --name codex-lb " in f" {command} "
    )


def _volume_init_index(commands: list[str]) -> int:
    return next(
        index
        for index, command in enumerate(commands)
        if command.startswith("container run ") and " --entrypoint chown " in f" {command} "
    )


def _mutation_commands(commands: list[str]) -> list[str]:
    mutations = ("container system start", "container build", "container run", "container stop", "container delete")
    return [command for command in commands if command.startswith(mutations)]


def test_script_is_executable_and_posix_shell_parses() -> None:
    assert os.access(_SOURCE_SCRIPT, os.X_OK)
    subprocess.run(["sh", "-n", str(_SOURCE_SCRIPT)], check=True)


def test_repository_artifacts_expose_the_apple_container_contract() -> None:
    script = _SOURCE_SCRIPT.read_text(encoding="utf-8")
    guide = (_REPO_ROOT / "docs" / "deployment" / "apple-containers.md").read_text(encoding="utf-8")
    main_spec = (_REPO_ROOT / "openspec" / "specs" / "deployment-installation" / "spec.md").read_text(encoding="utf-8")

    assert "MANAGED_LABEL_KEY=io.codex-lb.managed-by" in script
    assert "--publish 127.0.0.1:2455:2455" in script
    assert "--publish 127.0.0.1:1455:1455" in script
    assert "VOLUME_NAME=codex-lb-data" in script
    assert "CONTAINER_DATA_DIR=/var/lib/codex-lb" in script
    assert "CONTAINER_NETWORK=default" in script
    assert 'network inspect "${CONTAINER_NETWORK}"' in script
    assert "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS" in script
    for command in ("up", "build", "restart", "down", "status", "logs"):
        assert f"./scripts/apple-container.sh {command}" in guide
    assert "openspec/specs/deployment-installation" in guide
    assert "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS" in guide
    assert "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS" in main_spec
    assert "### Requirement: Apple Containers provides a zero-config local install path" in main_spec
    assert "### Requirement: Apple Containers lifecycle operations preserve ownership and data" in main_spec


@pytest.mark.parametrize(
    "relative_path",
    ["README.md", "docs/getting-started.md", "docs/index.md", "mkdocs.yml"],
)
def test_quick_start_and_navigation_link_apple_container_guide(relative_path: str) -> None:
    content = (_REPO_ROOT / relative_path).read_text(encoding="utf-8")

    assert "apple-containers.md" in content


def test_fresh_up_starts_system_builds_and_runs_secure_defaults(
    fake_runtime: FakeAppleContainerRuntime,
) -> None:
    result = fake_runtime.run("up")

    assert result.returncode == 0, result.stderr
    assert "ready: http://localhost:2455" in result.stdout
    commands = fake_runtime.commands()
    assert "container system start --enable-kernel-install" in commands
    gateway_index = _index(commands, "container network inspect default")
    build_index = _index(commands, "container build ")
    init_index = _volume_init_index(commands)
    run_index = _main_run_index(commands)
    assert gateway_index < build_index < init_index < run_index

    init_command = commands[init_index]
    assert "--rm --user 0 --entrypoint chown" in init_command
    assert "--volume codex-lb-data:/var/lib/codex-lb" in init_command
    assert init_command.endswith("codex-lb:apple-local app:app /var/lib/codex-lb")
    assert " -R " not in f" {init_command} "

    run_command = commands[run_index]
    assert "--label io.codex-lb.managed-by=apple-container-script" in run_command
    assert "--network default" in run_command
    assert "--publish 127.0.0.1:2455:2455" in run_command
    assert "--publish 127.0.0.1:1455:1455" in run_command
    assert "--volume codex-lb-data:/var/lib/codex-lb" in run_command
    assert "--env CODEX_LB_DATA_DIR=/var/lib/codex-lb" in run_command
    assert "--env CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=192.168.64.1/32" in run_command
    assert "--user 0" not in run_command
    assert "--env-file" not in run_command
    assert run_command.endswith("codex-lb:apple-local")
    assert "curl --fail --silent --show-error --max-time 2 http://127.0.0.1:2455/health/ready" in commands


def test_up_passes_optional_repository_env_file(fake_runtime: FakeAppleContainerRuntime) -> None:
    fake_runtime.set_system_running()
    env_file = fake_runtime.project_root / ".env.local"
    env_file.write_text(
        "CODEX_LB_DATA_DIR=/tmp/not-persistent\n"
        "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=10.0.0.0/8\n"
        "CODEX_LB_TELEMETRY_ENABLED=false\n",
        encoding="utf-8",
    )

    result = fake_runtime.run("up", FAKE_NETWORK_GATEWAY="10.42.0.1")

    assert result.returncode == 0, result.stderr
    commands = fake_runtime.commands()
    run_command = commands[_main_run_index(commands)]
    assert f"--env-file {env_file}" in run_command
    env_file_index = run_command.index(f"--env-file {env_file}")
    data_dir_index = run_command.index("--env CODEX_LB_DATA_DIR=/var/lib/codex-lb")
    gateway_index = run_command.index("--env CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=10.42.0.1/32")
    assert env_file_index < data_dir_index < gateway_index


def test_up_uses_runtime_assigned_gateway_without_hard_coding_the_default_subnet(
    fake_runtime: FakeAppleContainerRuntime,
) -> None:
    fake_runtime.set_system_running()

    result = fake_runtime.run("up", FAKE_NETWORK_GATEWAY="172.20.15.254")

    assert result.returncode == 0, result.stderr
    commands = fake_runtime.commands()
    run_command = commands[_main_run_index(commands)]
    assert "container network inspect default" in commands
    assert "--network default" in run_command
    assert "--env CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=172.20.15.254/32" in run_command
    assert "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=192.168.64.1/32" not in run_command
    assert "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=172.20.15.0/24" not in run_command


@pytest.mark.parametrize(
    ("environment", "message"),
    [
        ({"FAKE_NETWORK_INSPECT_FAILURE": "1"}, "could not inspect Apple's 'default' network"),
        ({"FAKE_NETWORK_GATEWAY_MODE": "missing"}, "must report exactly one IPv4 gateway"),
        ({"FAKE_NETWORK_GATEWAY_MODE": "malformed"}, "reported an invalid IPv4 gateway"),
        ({"FAKE_NETWORK_GATEWAY_MODE": "multiple"}, "must report exactly one IPv4 gateway"),
    ],
)
def test_gateway_discovery_failure_preserves_existing_managed_container_before_deployment_mutation(
    fake_runtime: FakeAppleContainerRuntime,
    environment: dict[str, str],
    message: str,
) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    result = fake_runtime.run("up", **environment)

    assert result.returncode != 0
    assert message in result.stderr
    assert (fake_runtime.state_dir / "container-exists").exists()
    assert (fake_runtime.state_dir / "container-running").exists()
    commands = fake_runtime.commands()
    assert "container network inspect default" in commands
    assert not any(
        command.startswith(("container build", "container run", "container stop", "container delete"))
        for command in commands
    )


def test_repeated_up_builds_before_replacing_managed_container(
    fake_runtime: FakeAppleContainerRuntime,
) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    result = fake_runtime.run("up")

    assert result.returncode == 0, result.stderr
    commands = fake_runtime.commands()
    assert _index(commands, "container build ") < _index(commands, "container stop ")
    assert _index(commands, "container stop ") < _volume_init_index(commands)
    assert _volume_init_index(commands) < _index(commands, "container delete ")
    assert _index(commands, "container delete ") < _main_run_index(commands)
    assert not any(command.startswith("container volume") for command in commands)


def test_volume_initialization_failure_restarts_and_preserves_existing_container(
    fake_runtime: FakeAppleContainerRuntime,
) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    result = fake_runtime.run("up", FAKE_VOLUME_INIT_FAILURE="1")

    assert result.returncode != 0
    assert "previous container was not deleted" in result.stderr
    assert "restarting the previous codex-lb" in result.stdout
    assert (fake_runtime.state_dir / "container-exists").exists()
    assert (fake_runtime.state_dir / "container-running").exists()
    commands = fake_runtime.commands()
    assert _index(commands, "container build ") < _index(commands, "container stop ")
    assert _index(commands, "container stop ") < _volume_init_index(commands)
    assert "container start codex-lb" in commands
    assert not any(command.startswith("container delete") for command in commands)
    assert not any(
        command.startswith("container run ") and " --name codex-lb " in f" {command} " for command in commands
    )


def test_build_failure_leaves_existing_managed_container_running(
    fake_runtime: FakeAppleContainerRuntime,
) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    result = fake_runtime.run("up", FAKE_BUILD_FAILURE="1")

    assert result.returncode == 42
    assert (fake_runtime.state_dir / "container-running").exists()
    commands = fake_runtime.commands()
    assert (
        "container build --platform linux/arm64 --tag codex-lb:apple-local " + str(fake_runtime.project_root)
        in commands
    )
    assert not any(command.startswith(("container stop", "container delete", "container run")) for command in commands)


@pytest.mark.parametrize(
    ("environment", "message"),
    [
        ({"FAKE_UNAME_SYSTEM": "Linux"}, "requires macOS 26"),
        ({"FAKE_UNAME_MACHINE": "x86_64"}, "Apple silicon Mac"),
        ({"FAKE_MACOS_VERSION": "25.6"}, "requires macOS 26"),
        (
            {"FAKE_CONTAINER_VERSION": "container CLI version 1.2.9 (build: release, commit: test)"},
            "container CLI 1.3 or newer",
        ),
    ],
)
def test_unsupported_prerequisite_fails_before_mutation(
    fake_runtime: FakeAppleContainerRuntime,
    environment: dict[str, str],
    message: str,
) -> None:
    result = fake_runtime.run("up", **environment)

    assert result.returncode != 0
    assert message in result.stderr
    assert _mutation_commands(fake_runtime.commands()) == []


@pytest.mark.parametrize("command", ["up", "restart", "down"])
def test_unmanaged_name_conflict_is_never_mutated(
    fake_runtime: FakeAppleContainerRuntime,
    command: str,
) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=False, running=True)

    result = fake_runtime.run(command)

    assert result.returncode != 0
    assert "not managed by this script" in result.stderr
    commands = fake_runtime.commands()
    assert not any(entry.startswith(("container build", "container stop", "container delete")) for entry in commands)
    assert (fake_runtime.state_dir / "container-running").exists()


def test_readiness_failure_prints_logs_and_preserves_runtime_state(
    fake_runtime: FakeAppleContainerRuntime,
) -> None:
    fake_runtime.set_system_running()

    result = fake_runtime.run("up", FAKE_CURL_FAILURES="99")

    assert result.returncode != 0
    assert "recent container logs" in result.stderr
    assert "fake codex-lb logs" in result.stderr
    assert "did not become ready within 3 seconds" in result.stderr
    assert (fake_runtime.state_dir / "container-exists").exists()
    assert not any(command.startswith("container volume") for command in fake_runtime.commands())


def test_restart_reuses_existing_container_without_rebuild(fake_runtime: FakeAppleContainerRuntime) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    result = fake_runtime.run("restart")

    assert result.returncode == 0, result.stderr
    commands = fake_runtime.commands()
    assert any(command.startswith("container stop --time 40 codex-lb") for command in commands)
    assert "container start codex-lb" in commands
    assert not any(command.startswith(("container build", "container run", "container delete")) for command in commands)


def test_down_deletes_only_container_and_preserves_volume(fake_runtime: FakeAppleContainerRuntime) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    result = fake_runtime.run("down")

    assert result.returncode == 0, result.stderr
    assert "codex-lb-data was preserved" in result.stdout
    commands = fake_runtime.commands()
    assert any(command.startswith("container stop --time 40 codex-lb") for command in commands)
    assert "container delete codex-lb" in commands
    assert not any(command.startswith("container volume") for command in commands)
    assert not (fake_runtime.state_dir / "container-exists").exists()


def test_status_and_logs_are_read_only(fake_runtime: FakeAppleContainerRuntime) -> None:
    fake_runtime.set_system_running()
    fake_runtime.set_container(managed=True, running=True)

    status_result = fake_runtime.run("status")
    logs_result = fake_runtime.run("logs")

    assert status_result.returncode == 0, status_result.stderr
    assert logs_result.returncode == 0, logs_result.stderr
    assert "fake codex-lb logs" in logs_result.stdout
    commands = fake_runtime.commands()
    assert "container logs --follow codex-lb" in commands
    assert not any(
        command.startswith(
            ("container system start", "container build", "container run", "container stop", "container delete")
        )
        for command in commands
    )
