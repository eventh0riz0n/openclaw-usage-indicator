#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/openclaw-usage-indicator"
CONFIG_FILE="$CONFIG_DIR/config.json"
CACHE_FILE="$CONFIG_DIR/cache.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)"
# shellcheck source=./smart-refresh-lib.sh
source "$SCRIPT_DIR/smart-refresh-lib.sh"

load_config

# Expose the *active* refresh interval as a hint (useful for some runners).
# Argos itself uses filename suffix, but this doesn't hurt.
echo "# refresh=$active_refresh_seconds"

get_data() {
  # Prefer cache if present.
  if [[ -f "$CACHE_FILE" ]]; then
    cat "$CACHE_FILE"
    return 0
  fi
  openclaw status --usage --json
}

json="$(get_data)"

active="$(is_active)"
if [[ "$active" != "true" ]]; then
  echo "OpenClaw: idle"
  exit 0
fi

# Build label from usage windows
provider_name=$(jq -r '.usage.providers[0].displayName // .usage.providers[0].provider // "OpenClaw"' <<<"$json")
plan=$(jq -r '.usage.providers[0].plan // empty' <<<"$json")

windows=$(jq -r '.usage.providers[0].windows[]? | "\(.label):\(100 - (.usedPercent // 0))%"' <<<"$json" | xargs)

label="$provider_name"
if [[ -n "$windows" ]]; then
  label+=" $windows"
fi

# Argos format: first line = panel text; subsequent lines = menu.
echo "$label"

echo "---"

echo "OpenClaw usage"
if [[ -n "$plan" ]]; then
  echo "Plan: $plan"
fi

# Show raw window info + reset times
jq -r '.usage.providers[0].windows[]? | "\(.label): used \(.usedPercent)% (left \(100-(.usedPercent//0))%) resetAt=\(.resetAt // "?")"' <<<"$json" \
  | while read -r line; do
      echo "$line"
    done

# Convenience actions (Argos supports bash=...)
echo "---"
echo "OpenClaw dashboard | bash=xdg-open param1=http://127.0.0.1:18789/ terminal=false"
