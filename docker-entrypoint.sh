#!/bin/sh
# Hands /data to the unprivileged "node" user (a folder mounted from the host is often owned by
# root), then runs BookBox as that user rather than as root.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
