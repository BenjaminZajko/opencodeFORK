#!/bin/sh
set -eu

olive_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) ;;
  *) echo "This preview is for Linux x86-64 PCs." >&2; exit 1 ;;
esac

olive_prefix="${OLIVECODE_INSTALL_PREFIX:-$HOME/.local}"
olive_target="$olive_prefix/bin/olivecode"
olive_stage="$olive_target.preview-$$"
olive_backup="$olive_prefix/share/olivecode/versions/olivecode-before-desktop-preview-$(date +%Y%m%d-%H%M%S)-$$"
trap 'rm -f "$olive_stage"' EXIT HUP INT TERM
mkdir -p "$olive_prefix/bin" "$olive_prefix/share/olivecode/versions"
install -m 755 "$olive_root/olivecode" "$olive_stage"
"$olive_stage" --version
if [ -e "$olive_target" ]; then cp -p "$olive_target" "$olive_backup"; echo "Previous command backed up to $olive_backup"; fi
mv -f "$olive_stage" "$olive_target"
echo "Preview installed: $olive_target"
echo "Accounts and conversations were not changed."

if [ "${1:-}" = "--dependencies" ]; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "This optional package setup is for Ubuntu/Debian. See README for other systems." >&2
    exit 1
  fi
  echo "Installing free desktop accessibility and clipboard support from your configured Ubuntu repositories."
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update
    apt-get install -y python3-pyatspi python3-gi gir1.2-gtk-3.0 wl-clipboard xclip xdotool
  else
    sudo apt-get update
    sudo apt-get install -y python3-pyatspi python3-gi gir1.2-gtk-3.0 wl-clipboard xclip xdotool
  fi
fi

echo "Run $olive_target, choose Computer → Start visible control, then ask about the already-open app."
echo "Run ./diagnose.sh if the app or clipboard is unavailable. This is an experimental preview."
