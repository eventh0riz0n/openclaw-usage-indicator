#!/usr/bin/env bash
set -euo pipefail

# Prototype installer for GNOME + Argos.

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/openclaw-usage-indicator"
ARGOS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/argos"
BIN_DIR="$HOME/.local/bin"

mkdir -p "$CONFIG_DIR" "$ARGOS_DIR" "$BIN_DIR"

# Ensure jq exists
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install it first (e.g. sudo apt install jq)." >&2
  exit 1
fi

# Write default config if missing
if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  cat > "$CONFIG_DIR/config.json" <<'JSON'
{
  "onlyWhenActive": true,
  "activeWindowMinutes": 15,

  "activeRefreshSeconds": 150,
  "idleRefreshSeconds": 1800
}
JSON
  echo "Wrote default config to $CONFIG_DIR/config.json"
else
  echo "Config exists: $CONFIG_DIR/config.json"
fi

install -m 0755 "$SRC_DIR/openclaw-usage-indicator.sh" "$BIN_DIR/openclaw-usage-indicator"
install -m 0755 "$SRC_DIR/update-cache.sh" "$BIN_DIR/openclaw-usage-update-cache"

# Argos refresh is controlled via filename suffix.
# We'll create a launcher script that reads config and prints the indicator, but Argos still needs a fixed refresh.
# So we symlink with a sane default: 5 minutes.
argos_script="$ARGOS_DIR/openclaw-usage.5m.sh"
ln -sf "$BIN_DIR/openclaw-usage-indicator" "$argos_script"
chmod +x "$argos_script"

echo "Installed scripts:"
echo "- $BIN_DIR/openclaw-usage-indicator"
echo "- $BIN_DIR/openclaw-usage-update-cache"
echo "Argos script: $argos_script"

echo
echo "Next: install the Argos GNOME extension if you don't have it."
echo "Then GNOME Shell should show the indicator in the top bar within ~5 minutes."
