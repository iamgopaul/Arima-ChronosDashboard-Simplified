#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_PYTHON="$ROOT_DIR/.venv/bin/python"
VENV_UVICORN="$ROOT_DIR/.venv/bin/uvicorn"

wait_for_port_clear() {
  local port="$1"
  local attempts="${2:-20}"

  for ((i = 1; i <= attempts; i++)); do
    local output
    local -a pids=()
    output="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$output" ]]; then
      pids=("${(@f)output}")
    fi
    if (( ${#pids[@]} == 0 )); then
      return 0
    fi
    sleep 0.5
  done

  return 1
}

stop_port_listener() {
  local port="$1"
  local name="$2"
  local output
  local -a pids=()
  output="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$output" ]]; then
    pids=("${(@f)output}")
  fi

  if (( ${#pids[@]} == 0 )); then
    return 0
  fi

  echo "Stopping existing ${name} on port ${port} (PID(s) ${pids[*]})"
  kill ${pids[@]} 2>/dev/null || true

  if wait_for_port_clear "$port" 10; then
    return 0
  fi

  output="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  pids=()
  if [[ -n "$output" ]]; then
    pids=("${(@f)output}")
  fi
  if (( ${#pids[@]} > 0 )); then
    echo "Force stopping ${name} on port ${port} (PID(s) ${pids[*]})"
    kill -9 ${pids[@]} 2>/dev/null || true
  fi

  if ! wait_for_port_clear "$port" 10; then
    echo "Could not free port ${port}. Please stop the ${name} process manually."
    exit 1
  fi
}

wait_for_backend_health() {
  for ((i = 1; i <= 20; i++)); do
    if curl --silent --show-error --max-time 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
      return 0
    fi

    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo "Backend process exited before becoming healthy."
      return 1
    fi

    sleep 0.5
  done

  echo "Backend did not become healthy on http://127.0.0.1:8000/api/health"
  return 1
}

if [[ ! -x "$VENV_PYTHON" || ! -x "$VENV_UVICORN" ]]; then
  echo "Backend virtual environment not found. Expected at .venv/"
  echo "Create it with:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Frontend dependencies are missing. Install them with:"
  echo "  cd frontend && npm install"
  exit 1
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

stop_port_listener 8000 "backend"
stop_port_listener 5173 "frontend"

echo "Starting FastAPI backend on http://127.0.0.1:8000"
PYTHONPYCACHEPREFIX="$ROOT_DIR/.pycache" "$VENV_UVICORN" app.main:app --app-dir "$BACKEND_DIR" --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

if ! wait_for_backend_health; then
  exit 1
fi

echo "Starting Vite frontend on http://127.0.0.1:5173"
cd "$FRONTEND_DIR"
npm run dev -- --host 127.0.0.1 &
FRONTEND_PID=$!

wait "$FRONTEND_PID"
