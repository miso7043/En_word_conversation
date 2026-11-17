#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -e .env ]; then
  password=$(openssl rand -hex 24)
  (umask 077; set -C; printf 'WORDSTUDY_DB_PASSWORD=%s\nWORDSTUDY_PORT=43871\n' "$password" > .env)
fi

podman compose -p wordstudy up -d --build --force-recreate
podman port wordStudy_ 43871/tcp
