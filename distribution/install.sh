#!/bin/sh
# OliveCode user installer. No sudo and no changes to other coding tools.
set -eu

repo='https://github.com/BenjaminZajko/opencodeFORK/releases/latest/download'
base=${OLIVECODE_RELEASE_BASE_URL:-$repo}
system=$(uname -s)
machine=$(uname -m)
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
version=$("$binary" --version)
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
