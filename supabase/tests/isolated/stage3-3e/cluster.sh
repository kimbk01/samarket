#!/usr/bin/env bash
# Local throwaway PostgreSQL 16 cluster for the stage 3-E isolated tests (never a Supabase project).
# Usage: cluster.sh start|stop
set -euo pipefail
D=/var/tmp/samarket_pgiso_3e
BIN=/usr/lib/postgresql/16/bin
case "${1:-}" in
  start)
    rm -rf "$D"; mkdir -p "$D"; chown postgres "$D"
    runuser -u postgres -- "$BIN/initdb" -A trust -D "$D/data" >/dev/null
    runuser -u postgres -- "$BIN/pg_ctl" -D "$D/data" -l "$D/log" -w -o "-p 55457 -k $D -c listen_addresses=''" start
    ;;
  stop)
    runuser -u postgres -- "$BIN/pg_ctl" -D "$D/data" -m fast stop
    ;;
  *) echo "usage: $0 start|stop"; exit 2;;
esac
