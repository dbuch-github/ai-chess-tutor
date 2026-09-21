#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
command -v node >/dev/null || { echo 'Install Node.js 22.12+ from https://nodejs.org first.'; exit 1; }
if ! command -v apt-get >/dev/null; then
  echo 'Automated system setup targets Ubuntu 24.04 (apt). See PLATTFORMEN.md for manual setup on other distributions.'
  exit 1
fi
sudo apt-get update
sudo apt-get install -y build-essential git python3 meson ninja-build pkg-config libeigen3-dev zlib1g-dev \
  libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libsecret-1-0 gnome-keyring bluez \
  libnotify4 libxss1 libxtst6 xdg-utils
node scripts/setup.mjs
