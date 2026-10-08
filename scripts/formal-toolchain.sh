#!/bin/sh
set -eu
# Remove Node startup hooks BEFORE invoking Node. The process cannot undo a
# preload that already ran. PATH is the explicitly selected trusted toolchain.
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "${1:-}" in
  install) script=install-toolchain.mjs ;;
  check) script=check-toolchain.mjs ;;
  typecheck) script=typecheck.mjs ;;
  *) echo 'Usage: sh scripts/formal-toolchain.sh install|check|typecheck' >&2; exit 2 ;;
esac
shift
exec env -i PATH="$PATH" node "$root/scripts/$script" "$@"
