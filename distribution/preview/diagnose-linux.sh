#!/bin/sh
set -u
olive_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
olive_report="$olive_root/olivecode-desktop-report.txt"
{
  echo "OliveCode desktop preview diagnostic — no conversations, clipboard contents or credentials are read"
  uname -srm
  printf 'Session type: %s\n' "${XDG_SESSION_TYPE:-unknown}"
  "$olive_root/olivecode" --version
  for olive_name in python3 wl-copy xclip xsel xdotool chromium google-chrome; do
    if command -v "$olive_name" >/dev/null 2>&1; then printf '%s: available\n' "$olive_name"; else printf '%s: missing\n' "$olive_name"; fi
  done
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' '{"action":"status"}' '{"action":"find_app","query":"Codex"}' '{"action":"find_app","query":"Claude"}' '{"action":"close"}' | python3 "$olive_root/native-desktop.py"
  fi
} > "$olive_report" 2>&1
cat "$olive_report"
printf '\nSaved to %s\n' "$olive_report"
