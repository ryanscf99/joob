#!/bin/bash
# Double-click in Finder → starts jOOB and opens Chrome automatically.
cd "$(dirname "$0")"
# Ensure executable (Finder sometimes strips flags after download)
chmod +x ./start.sh ./start.command 2>/dev/null || true
exec bash ./start.sh
