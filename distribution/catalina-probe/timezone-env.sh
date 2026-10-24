# Source this before starting the archived runtime. Its default timezone lookup
# requires ICU 65, which Catalina's system ICU does not provide.
if [ -z "${TZ:-}" ]; then
  olivecode_zone_link=$(readlink /etc/localtime) || {
    echo "Cannot detect this Mac's timezone from /etc/localtime. No timezone was changed." >&2
    exit 1
  }
  case "$olivecode_zone_link" in
    */zoneinfo/*) TZ=${olivecode_zone_link#*/zoneinfo/} ;;
    *) echo "Unrecognized local timezone path: $olivecode_zone_link" >&2; exit 1 ;;
  esac
  case "$TZ" in
    ''|/*|*..*) echo "Invalid local timezone identifier." >&2; exit 1 ;;
  esac
  export TZ
  unset olivecode_zone_link
fi
