#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
command -v node >/dev/null || { echo 'Install Node.js 22.12+ from https://nodejs.org first.'; exit 1; }
command -v brew >/dev/null || { echo 'Install Homebrew from https://brew.sh first (required for lc0).'; exit 1; }
if ! brew list lc0 >/dev/null 2>&1; then brew install lc0; fi
node scripts/setup.mjs
