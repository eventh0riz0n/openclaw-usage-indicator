/*
 * OpenClaw Usage Indicator (GNOME Shell)
 *
 * Data source:
 *   openclaw status --usage --json
 *
 * Active detection (fast, no RPC):
 *   ~/.openclaw/agents/main/sessions/sessions.json -> recent[0].updatedAt
 */

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const DEFAULTS = {
  activeWindowMinutes: 15,
  activeRefreshSeconds: 150, // 2.5 min
  idleRefreshSeconds: 1800,  // 30 min
  showWhenIdle: true,
  idleLabel: 'OpenClaw: idle',
};

function nowMs() {
  // monotonic ms isn't comparable to updatedAt epoch; use epoch.
  return Date.now();
}

function readJsonFile(path) {
  try {
    const file = Gio.File.new_for_path(path);
    const [ok, bytes] = file.load_contents(null);
    if (!ok)
      return null;
    const text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function isActive(settings) {
  // Determine "active" based on sessions.json (fast local file check)
  const activeWindowMinutes = settings.get_int('active-window-minutes');
  const sessionsPath = GLib.build_filenamev([GLib.get_home_dir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json']);
  const json = readJsonFile(sessionsPath);
  if (!json || !json.recent || json.recent.length === 0)
    return true;

  const updatedAt = json.recent[0].updatedAt;
  if (!updatedAt)
    return true;

  const ageMs = nowMs() - updatedAt;
  const maxAgeMs = activeWindowMinutes * 60 * 1000;
  return ageMs <= maxAgeMs;
}

function deriveWindowLabelFromResetAt(resetAtMs) {
  if (typeof resetAtMs !== 'number')
    return null;

  const hoursLeft = (resetAtMs - nowMs()) / 3600000;
  if (!Number.isFinite(hoursLeft))
    return null;

  // Heuristic buckets:
  // - "5h" window typically resets in a few hours
  // - "Day" window resets within ~36h
  // - otherwise it's the ~7-day bucket
  if (hoursLeft > 36)
    return 'Week';
  return 'Day';
}

function normalizeWindowLabel(w) {
  const raw = w?.label;

  // If we have resetAt, prefer to derive Day/Week from the actual time-to-reset
  // instead of trusting the raw label (OpenClaw sometimes reports Week as "Day").
  if (typeof w?.resetAt === 'number') {
    const derived = deriveWindowLabelFromResetAt(w.resetAt);

    // Keep "5h" as-is (it's already explicit and more useful than derived "Day").
    if (raw === '5h')
      return raw;

    if (derived)
      return derived;
  }

  return raw || null;
}

function formatUsageLabel(usageJson) {
  // usageJson expected shape from `openclaw status --usage --json`
  const providers = usageJson?.usage?.providers;
  if (!providers || providers.length === 0)
    return null;

  const p0 = providers[0];
  const name = p0.displayName || p0.provider || 'OpenClaw';
  const windows = p0.windows || [];

  const parts = [];
  for (const w of windows) {
    const label = normalizeWindowLabel(w);
    const used = typeof w.usedPercent === 'number' ? w.usedPercent : 0;
    const left = Math.max(0, 100 - used);
    if (label)
      parts.push(`${label}:${left}%`);
  }

  if (parts.length === 0)
    return name;

  return `${name} ${parts.join(' ')}`;
}

async function runOpenclawStatusUsageJson(openclawPath) {
  // We want stdout only.
  const argv = [openclawPath || 'openclaw', 'status', '--usage', '--json'];
  const proc = new Gio.Subprocess({
    argv,
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
  });

  proc.init(null);

  return await new Promise((resolve, reject) => {
    proc.communicate_utf8_async(null, null, (p, res) => {
      try {
        const [, stdout] = p.communicate_utf8_finish(res);
        resolve(stdout);
      } catch (e) {
        reject(e);
      }
    });
  });
}

const UsageIndicator = GObject.registerClass(
class UsageIndicator extends PanelMenu.Button {
  constructor(extension) {
    super(0.0, 'OpenClaw Usage Indicator');

    this._extension = extension;
    this._settings = extension.getSettings();

    this._label = new St.Label({
      text: 'OpenClaw…',
      y_align: Clutter.ActorAlign.CENTER,
    });

    this.add_child(this._label);

    // ---
    // Menu
    // ---
    this._statusItem = new PopupMenu.PopupMenuItem('Status: …', {reactive: false});
    this.menu.addMenuItem(this._statusItem);

    this._planItem = new PopupMenu.PopupMenuItem('Plan: …', {reactive: false});
    this.menu.addMenuItem(this._planItem);

    this._lastUpdateItem = new PopupMenu.PopupMenuItem('Last update: …', {reactive: false});
    this.menu.addMenuItem(this._lastUpdateItem);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const refreshItem = new PopupMenu.PopupMenuItem('Refresh now');
    refreshItem.connect('activate', () => {
      // Immediate refresh regardless of schedule.
      this._tick(true);
    });
    this.menu.addMenuItem(refreshItem);

    const dashItem = new PopupMenu.PopupMenuItem('Open OpenClaw dashboard');
    dashItem.connect('activate', () => {
      Util.spawn(['xdg-open', 'http://127.0.0.1:18789/']);
    });
    this.menu.addMenuItem(dashItem);

    this._timeoutId = null;
    this._inFlight = false;

    this._lastUpdatedMs = 0;

    this._settingsChangedId = this._settings.connect('changed', () => {
      this._scheduleNext(true);
    });

    // initial update
    this._scheduleNext(true);
  }

  destroy() {
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = null;
    }
    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }
    super.destroy();
  }

  _setText(text) {
    this._label.set_text(text);
  }

  _currentIntervalSeconds() {
    const active = isActive(this._settings);
    const activeSec = this._settings.get_int('active-refresh-seconds');
    const idleSec = this._settings.get_int('idle-refresh-seconds');
    return active ? activeSec : idleSec;
  }

  _scheduleNext(immediate = false) {
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = null;
    }

    const delay = immediate ? 1 : this._currentIntervalSeconds();
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
      this._timeoutId = null;
      this._tick();
      return GLib.SOURCE_REMOVE;
    });
  }

  async _tick(force = false) {
    // Decide what to display when idle
    const active = isActive(this._settings);
    const showWhenIdle = this._settings.get_boolean('show-when-idle');
    const idleLabel = this._settings.get_string('idle-label');

    if (!active && showWhenIdle) {
      this._setText(idleLabel);
      this._statusItem.label.text = 'Status: idle';
      this._planItem.label.text = 'Plan: n/a';
      this._lastUpdateItem.label.text = this._lastUpdatedMs
        ? `Last update: ${new Date(this._lastUpdatedMs).toLocaleString()}`
        : 'Last update: never';
    }

    if (this._inFlight) {
      // Avoid piling up.
      this._scheduleNext(false);
      return;
    }

    // If idle and not showing, keep last value and back off schedule.
    // Unless forced (manual refresh).
    if (!force && !active && !showWhenIdle) {
      this._scheduleNext(false);
      return;
    }

    try {
      this._inFlight = true;
      let openclawPath = this._settings.get_string('openclaw-path');
      if (!openclawPath)
        openclawPath = 'openclaw';

      // Fallback for GNOME Shell PATH issues on some setups.
      if (openclawPath === 'openclaw') {
        const candidate = GLib.build_filenamev([GLib.get_home_dir(), '.npm-global', 'bin', 'openclaw']);
        if (GLib.file_test(candidate, GLib.FileTest.EXISTS))
          openclawPath = candidate;
      }

      const stdout = await runOpenclawStatusUsageJson(openclawPath);
      const json = JSON.parse(stdout);
      const label = formatUsageLabel(json);
      if (label)
        this._setText(label);
      else
        this._setText('OpenClaw: n/a');

      const provider = json?.usage?.providers?.[0]?.displayName ?? json?.usage?.providers?.[0]?.provider ?? 'OpenClaw';
      const plan = json?.usage?.providers?.[0]?.plan ?? 'n/a';

      this._lastUpdatedMs = nowMs();
      this._statusItem.label.text = `Status: ${provider}`;
      this._planItem.label.text = `Plan: ${plan}`;
      this._lastUpdateItem.label.text = `Last update: ${new Date(this._lastUpdatedMs).toLocaleString()}`;
    } catch (e) {
      // Keep it short in UI.
      this._setText('OpenClaw: err');
      this._statusItem.label.text = 'Status: error';
      this._planItem.label.text = 'Plan: n/a';
      this._lastUpdateItem.label.text = this._lastUpdatedMs
        ? `Last update: ${new Date(this._lastUpdatedMs).toLocaleString()}`
        : 'Last update: never';
    } finally {
      this._inFlight = false;
      this._scheduleNext(false);
    }
  }
});

export default class OpenClawUsageIndicatorExtension extends Extension {
  enable() {
    this._indicator = new UsageIndicator(this);
    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
}
