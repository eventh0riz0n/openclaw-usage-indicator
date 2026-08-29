#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="openclaw-usage-indicator@clawd"
SOURCE="gnome-extension/$UUID"
ZIP="${1:-$ROOT/gnome-extension/$UUID.zip}"

if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal -- "$SOURCE")" ]]; then
  echo "extension sources have uncommitted files; commit them before packaging" >&2
  exit 1
fi

# Archive only committed extension sources. Ignored local files (for example
# .env, databases, and keys) can never enter the release package.
git -C "$ROOT" archive \
  --format=zip \
  --output="$ZIP" \
  "HEAD:$SOURCE"

echo "Wrote $ZIP"