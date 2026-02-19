#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/openclaw-usage-indicator"
CONFIG_FILE="$CONFIG_DIR/config.json"
CACHE_FILE="$CONFIG_DIR/cache.json"

# Defaults
ACTIVE_WINDOW_MINUTES_DEFAULT=15
ONLY_WHEN_ACTIVE_DEFAULT=true
ACTIVE_REFRESH_SECONDS_DEFAULT=150   # 2.5 min
IDLE_REFRESH_SECONDS_DEFAULT=1800    # 30 min

read_config_json() {
  if [[ -f "$CONFIG_FILE" ]]; then
    cat "$CONFIG_FILE"
  else
    echo '{}'
  fi
}

load_config() {
  cfg_json="$(read_config_json)"

  active_window_minutes="$(jq -r --argjson d "$ACTIVE_WINDOW_MINUTES_DEFAULT" '.activeWindowMinutes // $d' <<<"$cfg_json")"
  only_when_active="$(jq -r --argjson d "$ONLY_WHEN_ACTIVE_DEFAULT" '.onlyWhenActive // $d' <<<"$cfg_json")"

  active_refresh_seconds="$(jq -r --argjson d "$ACTIVE_REFRESH_SECONDS_DEFAULT" '.activeRefreshSeconds // $d' <<<"$cfg_json")"
  idle_refresh_seconds="$(jq -r --argjson d "$IDLE_REFRESH_SECONDS_DEFAULT" '.idleRefreshSeconds // $d' <<<"$cfg_json")"
}

now_ms() { date +%s%3N; }

cache_age_s() {
  if [[ ! -f "$CACHE_FILE" ]]; then
    echo 999999
    return 0
  fi
  local now updated
  now=$(now_ms)
  updated=$(jq -r '.updatedAt // 0' "$CACHE_FILE" 2>/dev/null || echo 0)
  if [[ "$updated" == "0" ]]; then
    echo 999999
    return 0
  fi
  echo $(( (now - updated) / 1000 ))
}

# Determine recency of activity by reading sessions.json directly (fast, no gateway RPC).
# Falls back to "active" if unknown.
is_active() {
  if [[ "$only_when_active" != "true" ]]; then
    echo true
    return 0
  fi

  local sessions_file
  sessions_file="$HOME/.openclaw/agents/main/sessions/sessions.json"
  if [[ ! -f "$sessions_file" ]]; then
    echo true
    return 0
  fi

  local updated_at now age_ms max_age_ms
  updated_at=$(jq -r '.recent[0].updatedAt // empty' "$sessions_file" 2>/dev/null || true)
  if [[ -z "${updated_at:-}" ]]; then
    # Can't parse; assume active to avoid hiding info unexpectedly
    echo true
    return 0
  fi

  now=$(date +%s%3N)
  age_ms=$(( now - updated_at ))
  max_age_ms=$(( active_window_minutes * 60 * 1000 ))

  if (( age_ms <= max_age_ms )); then
    echo true
  else
    echo false
  fi
}

should_refresh_now() {
  local age_s active threshold
  age_s=$(cache_age_s)
  active=$(is_active)
  if [[ "$active" == "true" ]]; then
    threshold=$active_refresh_seconds
  else
    threshold=$idle_refresh_seconds
  fi

  if (( age_s >= threshold )); then
    echo true
  else
    echo false
  fi
}
