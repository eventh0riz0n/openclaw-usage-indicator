#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/openclaw-usage-indicator"
CACHE_FILE="$CONFIG_DIR/cache.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)"
# shellcheck source=./smart-refresh-lib.sh
source "$SCRIPT_DIR/smart-refresh-lib.sh"

mkdir -p "$CONFIG_DIR"
load_config

if [[ "$(should_refresh_now)" != "true" ]]; then
  # No-op: keep cache as-is
  exit 0
fi

now_ms_val=$(now_ms)
json=$(openclaw status --usage --json)

# Add updatedAt (ms) so the indicator can decide freshness.
jq --argjson now "$now_ms_val" '. + {updatedAt: $now}' <<<"$json" > "$CACHE_FILE.tmp"
mv "$CACHE_FILE.tmp" "$CACHE_FILE"
