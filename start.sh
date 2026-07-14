#!/bin/bash
# jOOB — double-click start.command (macOS) or run: ./start.sh
# Opens the browser when ready. Recovers from busy ports and missing PATH.
set +e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR" || exit 1

PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"
URL_LOCALHOST="http://localhost:${PORT}"
LOG_FILE="${PROJECT_DIR}/.joob-start.log"

# Finder / .command launches often have a minimal PATH
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
# nvm / fnm / volta (common Node installs)
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null
[ -d "$HOME/.fnm" ] && eval "$("$HOME/.fnm/fnm" env)" 2>/dev/null
[ -x "$HOME/.volta/bin/node" ] && export PATH="$HOME/.volta/bin:$PATH"
[ -d "/opt/homebrew/opt/node/bin" ] && export PATH="/opt/homebrew/opt/node/bin:$PATH"

log() {
  echo "$@" | tee -a "$LOG_FILE"
}

: >"$LOG_FILE"
log "==== jOOB start $(date) ===="
log "DIR=$PROJECT_DIR"
log "PATH=$PATH"

pause_exit() {
  local code="${1:-1}"
  echo ""
  echo "Log saved to: $LOG_FILE"
  if [ -t 0 ]; then
    read -r -p "Press Enter to close..."
  else
    sleep 3
  fi
  exit "$code"
}

if ! command -v node >/dev/null 2>&1; then
  log ""
  log "ERROR: Node.js not found."
  log "Install Node LTS from https://nodejs.org then try again."
  pause_exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  log "ERROR: npm not found next to Node."
  pause_exit 1
fi

log "Node: $(node -v)  npm: $(npm -v)"

# Install / refresh deps when missing or lockfile is newer
need_install=0
if [ ! -d "node_modules" ] || [ ! -d "node_modules/next" ]; then
  need_install=1
elif [ -f package-lock.json ] && [ package-lock.json -nt node_modules ]; then
  need_install=1
fi

if [ "$need_install" -eq 1 ]; then
  log "Installing / updating dependencies (first run or lockfile changed)..."
  npm install 2>&1 | tee -a "$LOG_FILE"
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    log "ERROR: npm install failed. See log above."
    pause_exit 1
  fi
fi

port_in_use() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

http_ok() {
  local code
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$URL" 2>/dev/null || true)"
    if [ -z "$code" ] || [ "$code" = "000" ]; then
      code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$URL_LOCALHOST" 2>/dev/null || true)"
    fi
  else
    # Fallback without curl
    code="$(node -e "fetch('$URL').then(r=>console.log(r.status)).catch(()=>console.log('000'))" 2>/dev/null || echo 000)"
  fi
  case "$code" in
    [1-5][0-9][0-9]) return 0 ;;
    *) return 1 ;;
  esac
}

free_port() {
  log "Freeing port ${PORT}..."
  local pids
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 0.5
    fi
  fi
  # Also clear stale next/webpack on this project
  pkill -f "next dev.*${PORT}" 2>/dev/null || true
}

open_browser() {
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL_LOCALHOST" 2>/dev/null || open "$URL_LOCALHOST"
  elif [ -d "/Applications/Safari.app" ]; then
    open -a "Safari" "$URL_LOCALHOST" 2>/dev/null || open "$URL_LOCALHOST"
  else
    open "$URL_LOCALHOST" 2>/dev/null || true
  fi
}

open_browser_when_ready() {
  local tries=0
  while [ "$tries" -lt 100 ]; do
    if http_ok; then
      open_browser
      return 0
    fi
    tries=$((tries + 1))
    sleep 0.4
  done
  log "Server did not answer in time — opening browser anyway."
  open_browser
}

# --- Port already taken? ---
if port_in_use; then
  if http_ok; then
    log ""
    log "jOOB is already running on port ${PORT}."
    log "Opening browser → ${URL_LOCALHOST}"
    open_browser
    log ""
    log "Leave the other Terminal window open to keep the server running."
    log "To stop:  lsof -ti :${PORT} | xargs kill"
    log ""
    if [ -t 0 ]; then
      read -r -p "Press Enter to close this window..."
    fi
    exit 0
  fi

  log ""
  log "Port ${PORT} is busy but not responding — clearing it..."
  free_port

  if port_in_use; then
    # Try next free port
    for try in 3001 3002 3003 3010; do
      if ! lsof -nP -iTCP:"$try" -sTCP:LISTEN >/dev/null 2>&1; then
        PORT="$try"
        URL="http://127.0.0.1:${PORT}"
        URL_LOCALHOST="http://localhost:${PORT}"
        log "Using free port ${PORT} instead."
        break
      fi
    done
  fi

  if port_in_use; then
    log "ERROR: Could not free port ${PORT}."
    log "Run:  lsof -ti :${PORT} | xargs kill -9"
    pause_exit 1
  fi
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

log ""
log "=============================================="
log "  jOOB — Macau youth job buddy"
log "=============================================="
log "  Node: $(node -v)"
log "  Opening:  ${URL_LOCALHOST}"
if [ -n "$LAN_IP" ]; then
  log "  Share (same Wi‑Fi):  http://${LAN_IP}:${PORT}"
fi
log "  Press Ctrl+C here to stop the server"
log "=============================================="
log ""

open_browser_when_ready &
OPENER_PID=$!
trap 'kill $OPENER_PID 2>/dev/null || true' EXIT

# Start Next.js (bind all interfaces for phone testing)
log "Starting: npm run dev -- -H 0.0.0.0 -p ${PORT}"
npm run dev -- -H 0.0.0.0 -p "$PORT" 2>&1 | tee -a "$LOG_FILE"
status=${PIPESTATUS[0]}

if [ "$status" -ne 0 ]; then
  log ""
  log "Start failed (code $status). Retrying after freeing port..."
  free_port
  npm run dev -- -H 0.0.0.0 -p "$PORT" 2>&1 | tee -a "$LOG_FILE"
  status=${PIPESTATUS[0]}
fi

if [ "$status" -ne 0 ]; then
  log ""
  log "ERROR: Could not start jOOB."
  log "Open Terminal and run:"
  log "  cd \"$PROJECT_DIR\""
  log "  npm install"
  log "  npm run dev"
  pause_exit "$status"
fi

exit "$status"
