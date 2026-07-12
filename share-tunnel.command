#!/bin/bash
# Share jOOB with a friend over the internet (Option C) — faster path when possible.
# Double-click, or: bash share-tunnel.command
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"

echo ""
echo "=============================================="
echo "  jOOB share tunnel"
echo "=============================================="
echo "  1) Make sure jOOB is running (start.command)"
echo "  2) This window prints a public HTTPS link"
echo "=============================================="
echo ""

# Wait for local server
tries=0
until curl -sf --max-time 1 "$URL" >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 40 ]; then
    echo "ERROR: jOOB is not running on port ${PORT}."
    echo "Double-click start.command first, then run this again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
  echo "Waiting for local jOOB on :${PORT}..."
  sleep 0.5
done

echo "Local server OK."
echo ""

# Prefer Cloudflare quick tunnel (usually faster / more reliable than free localtunnel)
if command -v cloudflared >/dev/null 2>&1; then
  echo "Using Cloudflare Tunnel (recommended)..."
  echo "Share the https://....trycloudflare.com URL with your friend."
  echo "Press Ctrl+C to stop sharing."
  echo ""
  exec cloudflared tunnel --url "$URL"
fi

echo "cloudflared not installed — using localtunnel (can be slower)."
echo "Tip for faster tunnels: brew install cloudflare/cloudflare/cloudflared"
echo ""
echo "Share the https://....loca.lt URL. Press Ctrl+C to stop."
echo ""
npx --yes localtunnel --port "$PORT"
