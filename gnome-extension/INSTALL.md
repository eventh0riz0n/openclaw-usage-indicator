# Install (GNOME Shell 46)

This is a prototype GNOME Shell extension.

## 1) Install files

```bash
EXT_DIR=~/.local/share/gnome-shell/extensions
mkdir -p "$EXT_DIR"
cp -a ./openclaw-usage-indicator@clawd "$EXT_DIR/"
```

## 2) Compile schemas

```bash
glib-compile-schemas "$EXT_DIR/openclaw-usage-indicator@clawd/schemas"
```

## 3) Ensure `openclaw` is on GNOME Shell PATH

On Ubuntu GNOME, `openclaw` installed in `~/.npm-global/bin` may not be in the GNOME Shell environment.

Quick test:
```bash
env | grep -E '^PATH='
```

If needed, add a wrapper or ensure your session PATH includes it (e.g. via `~/.profile`).

## 4) Enable extension

Use Extension Manager (GUI) or:
```bash
gnome-extensions enable openclaw-usage-indicator@clawd
```

## Settings

```bash
gsettings set org.gnome.shell.extensions.openclaw-usage-indicator active-refresh-seconds 180
```

List keys:
```bash
gsettings list-keys org.gnome.shell.extensions.openclaw-usage-indicator
```

## Troubleshooting logs

```bash
journalctl --user -f /usr/bin/gnome-shell
```

(Or use Looking Glass: Alt+F2 → `lg` → Extensions.)
