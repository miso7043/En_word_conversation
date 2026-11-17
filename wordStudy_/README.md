# React 서버 버전 운영 안내

Node 24·React·Fastify·PostgreSQL 17 버전입니다. 서버 없이 쓰는 `../htmlVersion/`과 실행 방식이 다릅니다. 학습 UI와 JSON 형식은 [루트 README](../README.md)를 참조하세요.

## 시작·중지

```bash
sh ./start.sh
podman compose -p wordstudy ps
podman compose -p wordstudy logs -f app
curl -fsS http://localhost:43871/api/health
# 자료·진도·음성 볼륨을 보존하며 중지
podman compose -p wordstudy stop
```

기존 `.env`의 DB 암호를 보존하세요. `start.sh`는 앱·DB 컨테이너를 재생성하고 마이그레이션을 적용하며 `wordstudy-data` 볼륨을 삭제하지 않습니다. `down -v`는 사용하지 마세요. DB 포트와 TTS 포트는 호스트에 공개하지 않습니다.

## Google 로그인 설정

1. Google Cloud에서 OAuth 웹 애플리케이션 클라이언트를 만들고 필요한 테스트 사용자·동의 화면 설정을 완료합니다.
2. 리디렉션 URI를 정확히 `http://localhost:43871/api/auth/callback`으로 등록합니다. 운영은 `https://학습도메인/api/auth/callback`을 사용합니다.
3. 기존 `.env`에 다음 키를 추가합니다. 실제 값은 `.env.example`에 기록하지 않습니다.

```dotenv
GOOGLE_CLIENT_ID=발급받은_클라이언트_ID
GOOGLE_CLIENT_SECRET=발급받은_클라이언트_비밀값
PUBLIC_ORIGIN=http://localhost:43871
```

`SESSION_SECRET`은 `start.sh`가 없을 때 32바이트 무작위 값으로 생성합니다. 직접 실행한다면 32자 이상을 설정합니다. 값 변경 시 기존 로그인 세션은 무효가 됩니다. 세션은 7일, 로그인 진행 요청은 10분 동안 유효합니다.

4. `sh ./start.sh` 후 `/administration`에서 Google 로그인하고 화면에 표시되는 **Google ID**를 확인합니다.
5. `config/access.example.json`을 `config/access.json`으로 복사하고 해당 ID를 등록합니다.

```json
{"adminGoogleIds": ["실제_Google_sub"]}
```

6. `sh ./start.sh`를 다시 실행합니다. 인증 설정·config가 있을 때만 `ENABLE_IMPORT=1`을 전달합니다. 첫 로그인 계정이 자동 관리자가 되지는 않습니다. config는 요청 때 다시 읽으므로 관리자 제외는 즉시 반영됩니다.

설정이 빠지면 공개 학습은 실행되지만 가져오기는 막힙니다. Compose를 직접 실행할 때 기본 `ENABLE_IMPORT=0`이며, 필요한 경우 명시적으로 `ENABLE_IMPORT=1`을 설정해야 합니다. 환경 변수를 1로 해도 관리자 세션·CSRF 검사를 생략하지 않습니다.

모바일에서 로그인할 때 `localhost`는 휴대폰 자신을 가리킵니다. HTTPS 운영 도메인·Google 리디렉션 URI·`PUBLIC_ORIGIN`을 일치시키고 HTTPS 리버스 프록시를 사용하세요. `PUBLIC_ORIGIN`은 경로·끝 슬래시 없이 지정합니다. 쿠키는 HttpOnly·SameSite=Lax이며 HTTPS 주소에서는 Secure가 붙습니다. Google 로그인에는 인터넷이 필요합니다.

## 선택적 로컬 TTS

Piper 1.3.0을 별도 컨테이너에서 실행합니다. GPU는 필요하지 않습니다. 최초 이미지·모델 다운로드에는 인터넷과 디스크 여유 공간이 필요합니다.

```bash
python3 scripts/download-model.py
```

모델·설정·모델 카드가 `models/`에 저장됩니다. 고정 리비전과 SHA-256을 검사하며 Git에서는 제외합니다. 출처·라이선스는 [권리 안내](../THIRD_PARTY_NOTICES.md)를 확인하세요.

`.env`에 다음 값을 추가하고 실행합니다.

```dotenv
TTS_URL=http://tts:8080
TTS_MODEL_REVISION=piper-1.3.0-ljspeech-medium-e9ab671f2a0e50a701b34361136ba3e6a3a9eb0c
```

```bash
sh ./start.sh
# 직접 Compose를 사용한다면
podman compose -p wordstudy --profile tts up -d --build
```

`start.sh`는 위 TTS_URL일 때 `tts` 프로필도 시작합니다. 모델 파일을 교체하면 `TTS_MODEL_REVISION`을 변경하세요. 문장 캐시에는 실제 모델·설정 파일의 해시도 반영합니다.

관리자는 학습 목록을 체크하고 속도·피치·반복 설정 후 **생성 오디오 → 선택 자료 음성 생성·재시도**를 누릅니다. 순차 작업 큐가 대기·생성 중·완료·실패 상태를 저장합니다. 동일 요청은 기존 결과를 재사용하고 실패한 요청은 다시 시도합니다. 재시작 때 중단된 작업은 대기열에 복구합니다.

한 번에 자료 100개, 반복 후 문장 2000개, 총 텍스트 10만 자까지 생성합니다. 파일은 `wordstudy-audio` 볼륨에 남습니다. 자동 삭제는 하지 않으므로 장기간 사용 시 볼륨 용량을 확인하세요. 일반 사용자는 완료 오디오를 재생·내보내기 할 수 있지만 생성은 관리자만 가능합니다.

## 개발

```bash
npm ci
npm run build
npm run verify
```

Vite 개발 서버는 `/api`를 43871 백엔드로 프록시합니다. Google 인증·CSRF·쿠키를 함께 확인하려면 빌드 결과를 백엔드에서 제공하는 같은 origin으로 접속하세요. 백엔드 직접 실행 시 `DATABASE_URL`을 설정하고 `npm start`를 사용합니다. DB 없이 프런트 화면만 확인하려면 저장소 루트에서 `python3 wordStudy_/scripts/browser-preview.py`를 실행합니다. 이 서버는 seed fixture와 인증 꺼짐 응답만 제공하며 운영 서버가 아닙니다.

### 추가 인터페이스

- `GET /api/auth/session`, `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`
- `POST /api/import`: `name`, `modified`, `data`, 선택 `policy: update|skip`; 결과 `added|updated|unchanged|skipped`
- `PUT /api/progress`: 로그인 계정의 `id`, `position`; 익명은 브라우저에 저장
- `POST /api/admin/claim-progress`: 관리자 자신의 기존 공동 진도 복사
- `GET /api/audio`, `POST /api/admin/audio`: 목록 조회·관리자 생성 요청
- `GET /api/audio/:id/file`: WAV·Range, `GET /api/audio/:id/export`: HTML용 음성 묶음

상태를 변경하는 인증 요청에는 동일한 Origin과 세션에서 받은 `X-CSRF-Token`이 필요합니다. OAuth 토큰·클라이언트 비밀값은 브라우저 저장소에 넣지 않습니다.
