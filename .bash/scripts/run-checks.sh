#!/usr/bin/env bash
set -u

ROOT="$(pwd)"
MINTTY="/usr/bin/mintty.exe"
BASH="/usr/bin/bash"

if [[ ! -x "$MINTTY" ]]; then
  echo "Error: mintty.exe not found at $MINTTY"
  echo "Try checking with: ls /usr/bin/mintty.exe"
  exit 1
fi

RUN_DIR="${TMPDIR:-/tmp}/pnpm-checks-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUN_DIR"

declare -A RESULTS=()

create_child_script() {
  local key="$1"
  local title="$2"
  local command="$3"

  local script="$RUN_DIR/$key.sh"
  local log="$RUN_DIR/$key.log"
  local status="$RUN_DIR/$key.status"
  local done_file="$RUN_DIR/$key.done"

  cat > "$script" <<EOF
#!/usr/bin/env bash
set +e

cd "$(printf "%q" "$ROOT")" || exit 1

LOG_FILE="$(printf "%q" "$log")"
STATUS_FILE="$(printf "%q" "$status")"
DONE_FILE="$(printf "%q" "$done_file")"

exec > >(tee -a "\$LOG_FILE") 2>&1

echo "=========================================="
echo "Task: $title"
echo "Command: $command"
echo "Directory: $ROOT"
echo "Started: \$(date "+%F %T")"
echo "=========================================="
echo

$command

code=\$?

echo
echo "=========================================="
echo "Finished: \$(date "+%F %T")"
echo "Exit code: \$code"
echo "=========================================="

echo "\$code" > "\$STATUS_FILE"
touch "\$DONE_FILE"

exit "\$code"
EOF

  chmod +x "$script"
}

start_task() {
  local key="$1"
  local title="$2"
  local command="$3"

  local script="$RUN_DIR/$key.sh"

  create_child_script "$key" "$title" "$command"

  "$MINTTY" --title "$title" "$BASH" "$script" &
}

wait_for_tasks() {
  local failed=0
  local remaining="$#"

  local -a keys=("$@")
  local -A reported=()

  while (( remaining > 0 )); do
    for key in "${keys[@]}"; do
      local done_file="$RUN_DIR/$key.done"
      local status_file="$RUN_DIR/$key.status"
      local log_file="$RUN_DIR/$key.log"

      if [[ -z "${reported[$key]+x}" && -f "$done_file" ]]; then
        local code
        code="$(cat "$status_file" 2>/dev/null || echo 1)"
        RESULTS["$key"]="$code"

        if [[ "$code" == "0" ]]; then
          echo "✅ $key passed"
        else
          echo "❌ $key failed with exit code $code"
          echo "   Log: $log_file"
          echo
          echo "Last 20 log lines for $key:"
          tail -n 20 "$log_file" 2>/dev/null || true
          echo

          failed=1
        fi

        reported["$key"]=1
        ((remaining--))
      fi
    done

    sleep 1
  done

  return "$failed"
}

print_summary() {
  echo
  echo "Summary:"
  echo "--------"

  local failed=0

  for key in "$@"; do
    local code="${RESULTS[$key]:-1}"

    if [[ "$code" == "0" ]]; then
      echo "✅ $key"
    else
      echo "❌ $key"
      failed=1
    fi
  done

  echo
  echo "Logs saved in:"
  echo "$RUN_DIR"

  return "$failed"
}

echo "Starting phased checks..."
echo "Logs directory: $RUN_DIR"
echo

ALL_TASKS=(
  "format"
  "lint"
  "typecheck"
  "test"
  "database"
)

echo "Phase 1: format"
echo "---------------"
start_task "format" "format" "pnpm format"

if ! wait_for_tasks "format"; then
  echo
  echo "Stopping because format failed."
  print_summary "${ALL_TASKS[@]}"
  exit 1
fi

echo
echo "Phase 2: lint/typecheck/test in parallel"
echo "----------------------------------------"
start_task "lint" "lint" "pnpm lint"
start_task "typecheck" "typecheck" "pnpm typecheck"
start_task "test" "test" "pnpm test"

if ! wait_for_tasks "lint" "typecheck" "test"; then
  echo
  echo "Stopping because one or more validation checks failed."
  print_summary "${ALL_TASKS[@]}"
  exit 1
fi

echo
echo "Phase 3: database migration and validation"
echo "------------------------------------------"
start_task "database" "database" "pnpm db:migrate && pnpm db:validate"

if ! wait_for_tasks "database"; then
  echo
  echo "Database phase failed."
  print_summary "${ALL_TASKS[@]}"
  exit 1
fi

print_summary "${ALL_TASKS[@]}"
exit $?