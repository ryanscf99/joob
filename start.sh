#!/bin/bash
# jOOB — double-click start.command (macOS) or run this script.
# Opens Chrome automatically. Handles port-already-in-use (zombie or healthy).
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"
URL_LOCALHOST="http://localhost:${PORT}"

export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "ERROR: Node.js not found."
  echo "Install Node from https://nodejs.org (LTS), then try again."
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first time)..."
  npm install
fi

port_in_use() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

http_ok() {
  # Any HTTP status means something is answering (even 404/500)
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$URL" 2>/dev/null || true)"
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$URL_LOCALHOST" 2>/dev/null || true)"
  fi
  case "$code" in
    [1-5][0-9][0-9]) return 0 ;;
    *) return 1 ;;
  esac
}

free_port() {
  echo "Freeing port ${PORT}..."
  # Prefer graceful, then force
  local pids
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.8
    pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 0.4
    fi
  fi
}

open_browser() {
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL_LOCALHOST" 2>/dev/null || open "$URL_LOCALHOST"
  else
    open "$URL_LOCALHOST"
  fi
}

# Wait until HTTP answers, then open browser (background-friendly)
open_browser_when_ready() {
  local tries=0
  while [ "$tries" -lt 90 ]; do
    if http_ok; then
      open_browser
      return 0
    fi
    tries=$((tries + 1))
    sleep 0.4
  done
  # Last resort: open anyway (Next may still be compiling)
  open_browser
}

# --- Port already taken? ---
if port_in_use; then
  if http_ok; then
    echo ""
    echo "jOOB is already running on port ${PORT}."
    echo "Opening browser → ${URL_LOCALHOST}"
    echo ""
    open_browser
    echo "Leave the other Terminal window open to keep the server running."
    echo "To fully stop jOOB later:"
    echo "  lsof -ti :${PORT} | xargs kill"
    echo ""
    read -r -p "Press Enter to close this window..."
    exit 0
  fi

  # Port busy but not serving HTTP → zombie / stuck process
  echo ""
  echo "Port ${PORT} is busy but not responding — clearing it..."
  free_port

  if port_in_use; then
    echo "ERROR: Could not free port ${PORT}."
    echo "Run manually:  lsof -ti :${PORT} | xargs kill -9"
    echo ""
    read -r -p "Press Enter to close..."
    exit 1
  fi
  echo "Port ${PORT} is free. Starting jOOB..."
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

echo ""
echo "=============================================="
echo "  jOOB — Macau youth job buddy"
echo "=============================================="
echo "  Node: $(node -v)"
echo "  Opening:  ${URL_LOCALHOST}"
if [ -n "$LAN_IP" ]; then
  echo "  Share (same Wi‑Fi):  http://${LAN_IP}:${PORT}"
fi
echo "  Press Ctrl+C here to stop the server"
echo "=============================================="
echo ""

# Open browser once the server answers
open_browser_when_ready &
OPENER_PID=$!
trap 'kill $OPENER_PID 2>/dev/null || true' EXIT

# If next still fails on bind, free port once more and retry
set +e
npm run dev -- -H 0.0.0.0 -p "$PORT"
status=$?
if [ "$status" -ne 0 ]; then
  echo ""
  echo "Start failed (code $status). Retrying after freeing port ${PORT}..."
  free_port
  set -e
  npm run dev -- -H 0.0.0.0 -p "$PORT"
else
  exit "$status"
fi
