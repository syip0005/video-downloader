#!/usr/bin/env bash
# Start the Vite frontend on :5173 with HMR (proxies /api -> :8000).
set -euo pipefail

cd "$(dirname "$0")/frontend"

# Pick up node from nvm if it isn't already on PATH.
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # nvm.sh relies on unset variables, so disable nounset while sourcing.
    set +u
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use --lts >/dev/null
    set -u
  else
    echo "node not found and ~/.nvm/nvm.sh missing — install Node first." >&2
    exit 1
  fi
fi

if [ ! -d node_modules ]; then
  npm install
fi

exec npm run dev -- --host
