#!/bin/sh
# OliveCode user installer. No sudo and no changes to other coding tools.
set -eu

repo='https://github.com/BenjaminZajko/opencodeFORK/releases/latest/download'
base=${OLIVECODE_RELEASE_BASE_URL:-$repo}
system=$(uname -s)
machine=$(uname -m)
if [ "$system" = Darwin ]; then
  # Rosetta reports x86_64 even on Apple Silicon; prefer the native package.
  if [ "$machine" = x86_64 ] && [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
    machine=arm64
  fi
  if ! macos_version=$(SYSTEM_VERSION_COMPAT=0 sw_vers -productVersion 2>/dev/null); then
    printf 'Could not detect your macOS version. Nothing was installed.\n' >&2
    exit 1
  fi
  if ! printf '%s\n' "$macos_version" | grep -Eq '^[0-9]{1,3}\.[0-9]{1,3}(\.[0-9]{1,3})?$'; then
    printf 'Could not understand macOS version: %s. Nothing was installed.\n' "$macos_version" >&2
    exit 1
  fi
  # Current Bun-based release packages require macOS 13 on both CPU families.
  # A baseline x64 package broadens CPU support, not macOS API availability.
  if ! printf '%s\n' "$macos_version" | awk -F. '{ exit !($1 >= 13) }'; then
    printf 'Detected macOS %s (%s).\n' "$macos_version" "$machine" >&2
    printf 'The current OliveCode release requires macOS 13 or newer.\n' >&2
    printf 'There is no verified OliveCode build for this macOS version yet.\n' >&2
    printf 'Nothing was downloaded or installed; any existing installation was left unchanged.\n' >&2
    printf 'Compatibility details: https://olivecode.dev/guide\n' >&2
    exit 1
  fi
fi
case "$system:$machine" in
  Darwin:arm64) target=macOS-arm64 ;;
  Darwin:x86_64) target=macOS-x64 ;;
  Linux:x86_64|Linux:aarch64|Linux:arm64)
    case "$machine" in x86_64) cpu=x64 ;; *) cpu=arm64 ;; esac
    target="Linux-$cpu"
    if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then target="$target-musl"; fi
    ;;
  *) printf 'OliveCode has no installer for %s/%s yet.\n' "$system" "$machine" >&2; exit 1 ;;
esac

if [ "$system" = Darwin ]; then
  printf 'Detected macOS %s (%s); selecting OliveCode for %s.\n' "$macos_version" "$machine" "$target"
fi
archive="OliveCode-${target}.zip"
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT HUP INT TERM
if [ -n "${OLIVECODE_ARCHIVE_PATH:-}" ]; then
  cp "$OLIVECODE_ARCHIVE_PATH" "$temp/$archive"
  cp "${OLIVECODE_SHA256_PATH:?Set OLIVECODE_SHA256_PATH for a local archive}" "$temp/$archive.sha256"
else
  command -v curl >/dev/null 2>&1 || { printf 'curl is required.\n' >&2; exit 1; }
  curl -fL --retry 2 "$base/$archive" -o "$temp/$archive"
  curl -fL --retry 2 "$base/$archive.sha256" -o "$temp/$archive.sha256"
fi

expected=$(awk '{print $1}' "$temp/$archive.sha256")
case "$expected" in
  *[!0-9a-fA-F]*|'') printf 'Invalid checksum file.\n' >&2; exit 1 ;;
esac
actual=$( (shasum -a 256 "$temp/$archive" 2>/dev/null || sha256sum "$temp/$archive") | awk '{print $1}')
if [ "$actual" != "$expected" ]; then
  printf 'The download did not match its published checksum. Nothing was installed.\n' >&2
  exit 1
fi
command -v unzip >/dev/null 2>&1 || { printf 'unzip is required.\n' >&2; exit 1; }
unzip -q "$temp/$archive" -d "$temp/extracted"
binary="$temp/extracted/olivecode"
test -f "$binary" || { printf 'The archive has no OliveCode executable.\n' >&2; exit 1; }
chmod 755 "$binary"
if ! version=$("$binary" --version 2>"$temp/startup-error"); then
  printf 'The downloaded OliveCode executable could not start on this system.\n' >&2
  if [ "$system" = Darwin ]; then
    printf 'Detected macOS %s (%s); selected %s.\n' "$macos_version" "$machine" "$target" >&2
  fi
  cat "$temp/startup-error" >&2
  printf 'Nothing was installed; any existing installation was left unchanged.\n' >&2
  exit 1
fi
case "$version" in *[!0-9A-Za-z.+-]*|'') printf 'Invalid executable version.\n' >&2; exit 1 ;; esac
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$' || { printf 'Invalid executable version.\n' >&2; exit 1; }

install_home=${OLIVECODE_INSTALL_HOME:-$HOME}
install_dir="$install_home/.local/share/olivecode/versions/$version"
command_dir="$install_home/.local/bin"
if [ -f "$install_dir/olivecode" ] && ! cmp -s "$binary" "$install_dir/olivecode"; then
  printf 'This version already exists with different contents. Use a new release version. Nothing was replaced.\n' >&2
  exit 1
fi
mkdir -p "$install_dir" "$command_dir"
cp "$binary" "$install_dir/olivecode.new"
chmod 755 "$install_dir/olivecode.new"
mv "$install_dir/olivecode.new" "$install_dir/olivecode"
if [ -d "$command_dir/olivecode" ]; then printf 'The olivecode command path is a directory. Nothing was replaced.\n' >&2; exit 1; fi
ln -sfn "$install_dir/olivecode" "$command_dir/olivecode"

case ":$PATH:" in
  *":$command_dir:"*) ;;
  *)
    case "${SHELL:-}" in
      */zsh) profile="$install_home/.zshrc" ;;
      */bash) if [ "$system" = Linux ]; then profile="$install_home/.bashrc"; else profile="$install_home/.bash_profile"; fi ;;
      *) profile="$install_home/.profile" ;;
    esac
    touch "$profile"
    if ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "$profile"; then
      printf '\n# OliveCode\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$profile"
    fi
    printf 'Added ~/.local/bin to %s. Open a new terminal to use the command.\n' "$profile"
    ;;
esac
printf 'Installed OliveCode %s. Run olivecode in any project folder.\n' "$version"
printf 'For this terminal now: export PATH="$HOME/.local/bin:$PATH"\n'
