#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

CONTAINER_CLI=container
CONTAINER_NAME=codex-lb
IMAGE_NAME=codex-lb:apple-local
VOLUME_NAME=codex-lb-data
CONTAINER_DATA_DIR=/var/lib/codex-lb
CONTAINER_NETWORK=default
MANAGED_LABEL_KEY=io.codex-lb.managed-by
MANAGED_LABEL_VALUE=apple-container-script
ENV_FILE=${ROOT_DIR}/.env.local
READY_URL=http://127.0.0.1:2455/health/ready
READY_ATTEMPTS=90
STOP_TIMEOUT_SECONDS=40

say() {
  printf '[apple-container] %s\n' "$*"
}

fail() {
  printf '[apple-container] error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/apple-container.sh [command]

Commands:
  up       Build the checked-out source, recreate codex-lb, and wait for readiness (default)
  build    Build the checked-out source without changing the running container
  restart  Restart the managed container without rebuilding it
  down     Stop and delete the managed container while preserving codex-lb-data
  status   Inspect the managed container
  logs     Follow the managed container logs
  help     Show this help
EOF
}

preflight() {
  command -v "${CONTAINER_CLI}" >/dev/null 2>&1 \
    || fail "Apple's container CLI was not found. Install version 1.3 or newer from https://github.com/apple/container/releases."

  [ "$(uname -s)" = Darwin ] \
    || fail "Apple Containers support requires macOS 26 or newer on Apple silicon."
  [ "$(uname -m)" = arm64 ] \
    || fail "Apple Containers support requires an Apple silicon Mac (arm64)."

  macos_version=$(sw_vers -productVersion 2>/dev/null || true)
  macos_major=${macos_version%%.*}
  case ${macos_major} in
    ''|*[!0-9]*)
      fail "Could not determine the macOS version."
      ;;
  esac
  [ "${macos_major}" -ge 26 ] \
    || fail "Apple Containers support requires macOS 26 or newer; found ${macos_version}."

  cli_version_output=$("${CONTAINER_CLI}" --version 2>&1) \
    || fail "Could not execute ${CONTAINER_CLI} --version."
  cli_version=$(printf '%s\n' "${cli_version_output}" | sed -n 's/^container CLI version \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
  [ -n "${cli_version}" ] \
    || fail "Could not parse the container CLI version from: ${cli_version_output}"

  cli_major=${cli_version%%.*}
  cli_minor=${cli_version#*.}
  if [ "${cli_major}" -lt 1 ] || { [ "${cli_major}" -eq 1 ] && [ "${cli_minor}" -lt 3 ]; }; then
    fail "container CLI 1.3 or newer is required; found ${cli_version_output}."
  fi
}

system_is_running() {
  "${CONTAINER_CLI}" system status >/dev/null 2>&1
}

ensure_system() {
  if system_is_running; then
    return
  fi

  say "starting Apple container services"
  "${CONTAINER_CLI}" system start --enable-kernel-install
  system_is_running || fail "Apple container services did not become ready. Run 'container system status' for details."
}

require_running_system() {
  system_is_running \
    || fail "Apple container services are not running. Run 'container system start' first."
}

require_curl() {
  command -v curl >/dev/null 2>&1 \
    || fail "curl is required to verify ${READY_URL}."
}

is_ipv4_address() {
  ipv4_value=${1:-}
  case ${ipv4_value} in
    ''|.*|*.|*..*|*[!0-9.]*)
      return 1
      ;;
  esac

  ipv4_old_ifs=${IFS}
  IFS=.
  set -- ${ipv4_value}
  IFS=${ipv4_old_ifs}
  [ "$#" -eq 4 ] || return 1

  for ipv4_octet do
    case ${ipv4_octet} in
      0)
        ;;
      0*)
        return 1
        ;;
    esac
    [ "${ipv4_octet}" -le 255 ] 2>/dev/null || return 1
  done
}

network_ipv4_gateway() {
  network_inspection=$("${CONTAINER_CLI}" network inspect "${CONTAINER_NETWORK}") \
    || fail "could not inspect Apple's '${CONTAINER_NETWORK}' network. Run 'container network inspect ${CONTAINER_NETWORK}' and 'container system logs' for details."

  network_gateway_candidates=$(printf '%s\n' "${network_inspection}" \
    | tr ',' '\n' \
    | sed -n 's/.*"ipv4Gateway"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  network_gateway_count=$(printf '%s\n' "${network_gateway_candidates}" \
    | sed '/^$/d' \
    | wc -l \
    | tr -d '[:space:]')

  [ "${network_gateway_count}" = 1 ] \
    || fail "Apple's '${CONTAINER_NETWORK}' network must report exactly one IPv4 gateway. Inspect it with 'container network inspect ${CONTAINER_NETWORK}'."

  network_gateway=$(printf '%s\n' "${network_gateway_candidates}" | sed -n '1p')
  is_ipv4_address "${network_gateway}" \
    || fail "Apple's '${CONTAINER_NETWORK}' network reported an invalid IPv4 gateway: ${network_gateway}"

  printf '%s\n' "${network_gateway}"
}

container_exists() {
  "${CONTAINER_CLI}" list --all --quiet | grep -Fqx "${CONTAINER_NAME}"
}

container_is_running() {
  "${CONTAINER_CLI}" list --quiet | grep -Fqx "${CONTAINER_NAME}"
}

container_is_managed() {
  "${CONTAINER_CLI}" inspect "${CONTAINER_NAME}" 2>/dev/null \
    | grep -Eq '"io\.codex-lb\.managed-by"[[:space:]]*:[[:space:]]*"apple-container-script"'
}

require_managed_if_present() {
  if container_exists && ! container_is_managed; then
    fail "a container named '${CONTAINER_NAME}' already exists but is not managed by this script; rename or remove it explicitly."
  fi
}

require_managed_container() {
  container_exists \
    || fail "the managed '${CONTAINER_NAME}' container does not exist; run 'scripts/apple-container.sh up' first."
  container_is_managed \
    || fail "the '${CONTAINER_NAME}' container is not managed by this script and was left untouched."
}

build_image() {
  say "building ${IMAGE_NAME} from ${ROOT_DIR}"
  "${CONTAINER_CLI}" build \
    --platform linux/arm64 \
    --tag "${IMAGE_NAME}" \
    "${ROOT_DIR}"
}

stop_managed_container() {
  if container_is_running; then
    say "stopping ${CONTAINER_NAME}"
    "${CONTAINER_CLI}" stop --time "${STOP_TIMEOUT_SECONDS}" "${CONTAINER_NAME}"
  fi
}

initialize_volume() {
  say "initializing ${VOLUME_NAME} ownership"
  "${CONTAINER_CLI}" run \
    --rm \
    --user 0 \
    --entrypoint chown \
    --volume "${VOLUME_NAME}:${CONTAINER_DATA_DIR}" \
    "${IMAGE_NAME}" \
    app:app \
    "${CONTAINER_DATA_DIR}"
}

print_recent_logs() {
  printf '[apple-container] recent container logs:\n' >&2
  "${CONTAINER_CLI}" logs -n 100 "${CONTAINER_NAME}" >&2 || true
}

wait_for_ready() {
  say "waiting for ${READY_URL}"
  attempt=1
  while [ "${attempt}" -le "${READY_ATTEMPTS}" ]; do
    if curl --fail --silent --show-error --max-time 2 "${READY_URL}" >/dev/null 2>&1; then
      say "ready: http://localhost:2455"
      return
    fi

    if ! container_is_running; then
      print_recent_logs
      fail "${CONTAINER_NAME} exited before it became ready."
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  print_recent_logs
  fail "${CONTAINER_NAME} did not become ready within ${READY_ATTEMPTS} seconds."
}

run_container() {
  network_gateway=$1
  set -- run \
    --detach \
    --name "${CONTAINER_NAME}" \
    --label "${MANAGED_LABEL_KEY}=${MANAGED_LABEL_VALUE}" \
    --network "${CONTAINER_NETWORK}" \
    --publish 127.0.0.1:2455:2455 \
    --publish 127.0.0.1:1455:1455 \
    --volume "${VOLUME_NAME}:${CONTAINER_DATA_DIR}"

  if [ -f "${ENV_FILE}" ]; then
    say "loading ${ENV_FILE}"
    set -- "$@" --env-file "${ENV_FILE}"
  fi

  # Apple container VMs do not expose Docker's /.dockerenv marker, and host
  # loopback publication enters through the VM gateway. Keep both lifecycle
  # overrides after the optional env file so the supported path stays exact.
  set -- "$@" --env "CODEX_LB_DATA_DIR=${CONTAINER_DATA_DIR}"
  set -- "$@" --env "CODEX_LB_PROXY_UNAUTHENTICATED_CLIENT_CIDRS=${network_gateway}/32"
  set -- "$@" "${IMAGE_NAME}"
  say "starting ${CONTAINER_NAME}"
  "${CONTAINER_CLI}" "$@"
}

up() {
  preflight
  require_curl
  ensure_system
  require_managed_if_present
  network_gateway=$(network_ipv4_gateway)
  say "using ${CONTAINER_NETWORK} network gateway ${network_gateway}/32 for protected localhost proxy access"

  # Keep the current deployment running if the fallible image build fails.
  build_image

  # Close the ownership-check race before any existing container is mutated.
  require_managed_if_present

  if container_exists; then
    was_running=false
    if container_is_running; then
      was_running=true
    fi
    stop_managed_container

    if ! initialize_volume; then
      if [ "${was_running}" = true ]; then
        say "volume initialization failed; restarting the previous ${CONTAINER_NAME}"
        "${CONTAINER_CLI}" start "${CONTAINER_NAME}" || true
      fi
      fail "could not make ${VOLUME_NAME} writable by the image's non-root app user; the previous container was not deleted."
    fi

    "${CONTAINER_CLI}" delete "${CONTAINER_NAME}"
  elif ! initialize_volume; then
    fail "could not make ${VOLUME_NAME} writable by the image's non-root app user."
  fi

  run_container "${network_gateway}"
  wait_for_ready
}

build() {
  preflight
  ensure_system
  build_image
}

restart() {
  preflight
  require_curl
  ensure_system
  require_managed_container
  stop_managed_container
  say "starting ${CONTAINER_NAME}"
  "${CONTAINER_CLI}" start "${CONTAINER_NAME}"
  wait_for_ready
}

down() {
  preflight
  ensure_system
  require_managed_if_present

  if ! container_exists; then
    say "${CONTAINER_NAME} is already down; ${VOLUME_NAME} was left untouched"
    return
  fi

  stop_managed_container
  "${CONTAINER_CLI}" delete "${CONTAINER_NAME}"
  say "removed ${CONTAINER_NAME}; ${VOLUME_NAME} was preserved"
}

status() {
  preflight
  require_running_system
  require_managed_container
  "${CONTAINER_CLI}" inspect "${CONTAINER_NAME}"
}

logs() {
  preflight
  require_running_system
  require_managed_container
  "${CONTAINER_CLI}" logs --follow "${CONTAINER_NAME}"
}

command=${1:-up}
case ${command} in
  up)
    up
    ;;
  build)
    build
    ;;
  restart)
    restart
    ;;
  down)
    down
    ;;
  status)
    status
    ;;
  logs)
    logs
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    fail "unknown command: ${command}"
    ;;
esac
