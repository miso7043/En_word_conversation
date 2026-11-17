#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -e .env ]; then
  password=$(openssl rand -hex 24)
  (umask 077; set -C; printf 'WORDSTUDY_DB_PASSWORD=%s\nWORDSTUDY_PORT=43871\n' "$password" > .env)
fi

# 세션 비밀값을 출력하지 않는다.
if ! grep -q '^SESSION_SECRET=' .env; then
  (umask 077; printf '\nSESSION_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env)
fi
# .env를 셸 코드로 실행하지 않고 설정 유무만 확인한다.
ENABLE_IMPORT=0
if grep -Eq '^GOOGLE_CLIENT_ID=.+$' .env && grep -Eq '^GOOGLE_CLIENT_SECRET=.+$' .env && [ -f config/access.json ]; then
  ENABLE_IMPORT=1
fi
export ENABLE_IMPORT
if grep -Eq '^TTS_URL=http://tts:8080/?$' .env; then
  podman compose -p wordstudy --profile tts up -d --build --force-recreate
else
  podman compose -p wordstudy up -d --build --force-recreate
fi
podman port wordStudy_ 43871/tcp
