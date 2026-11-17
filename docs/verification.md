# 검증 기록 · 2026-11-17

운영 `.env`와 DB 볼륨을 변경하지 않고 임시 환경에서 확인했습니다. 스크린샷은 실제 Chrome에서 seed fixture를 연 화면이며 운영 계정·비밀값을 포함하지 않습니다.

| 검사 | 결과·범위 |
| --- | --- |
| TypeScript·Vite | 프로덕션 빌드 통과 |
| 배포 이미지 | Node 24 이미지 빌드·비root 실행·임시 DB 초기화·학습/관리 URL·PWA 파일 제공·기본 가져오기 차단 통과 |
| 기존 재생 회귀 | 빠른 클릭·늦은 이벤트·정지·연속 재생·자동 시작 검증 통과 |
| 학습 재생 | 속도·피치·문장 반복·롤플레이 대기/다음·A-B 반복 통과 |
| JSON·저장 | 하위 호환·메타데이터 검증·진도 재배치·손상 JSON·저장소 차단 처리 통과 |
| Google 검증 | 테스트 RSA 키로 서명·발급자·대상·만료·nonce·발급 시각·sub의 정상/거부 사례 통과 |
| PostgreSQL 17 통합 | 별도 임시 컨테이너·DB에서 구형 스키마 업그레이드·기존 자료/진도 보존·관리자/일반/익명/만료 권한·CSRF·동시 가져오기·롤백·진도 복사·재시작·로그아웃 통과 |
| 오디오 API | 모의 TTS로 순차 큐·동일 요청 재사용·실패 재시도·WAV Range·HTML 내보내기·롤플레이 표시·재시작 보존 통과 |
| 실제 Piper 1.3.0 | 고정 ljspeech 모델로 22,050Hz WAV 생성·시간표·캐시 재사용·변경 문장만 생성·피치 변환·사용자 차례 무음 통과. 청감 품질 평가와는 별도 |
| Chrome 데스크톱 | React/HTML 목록·새로고침 선택 복원·검색·가리기·관리자 UI 차단·양쪽 오프라인 재진입·목록 자동 갱신 중 오디오 재생 유지 통과 |
| Chrome 모바일 크기 | 390×844 뷰포트에서 양쪽 가로 넘침 없음. 실제 휴대폰 검증과는 별도 |
| 마이크 예외 UI | 모의 인식기로 마이크 거부 안내·API 미지원 비활성화 확인 |
| HTML·서비스 워커·Python·셸 | 구문·정적 manifest 파일 검사 통과 |

## 실제 기기가 필요한 검사

| 환경 | 화면 켜짐 TTS | 잠금 화면 오디오·Media Session | Wake Lock·통화 후 복귀 | 실제 음성 인식 |
| --- | --- | --- | --- | --- |
| Android Chrome | 미검증 | 미검증 | 미검증 | 미검증 |
| iOS Safari | 미검증 | 미검증 | 미검증 | 미검증 |

실제 Google 계정 로그인은 사용자 소유 OAuth 클라이언트와 등록된 리디렉션 URI 설정 후 확인해야 합니다. 자동 검증은 Google 서버를 대신하지 않으며 실제 계정 인증이 완료되었다고 표시하지 않습니다.

모바일에서는 HTTPS 운영 주소에서 오디오를 직접 눌러 재생한 뒤 화면 잠금·탭 전환·잠금 화면 일시정지/재개·이전/다음·통화 중단/복귀를 순서대로 확인하세요. 롤플레이 자동 대기는 화면이 켜진 상태에서 확인합니다. PWA 설치·Wake Lock·음성 인식은 API 지원 여부와 OS 정책에 따라 달라집니다.

## 자동 검증 재현

Node 24, PostgreSQL 17 테스트 서버를 준비합니다. 테스트 계정에는 임시 DB 생성 권한이 필요합니다.

```bash
cd wordStudy_
npm ci
npm run build
npm run verify
node scripts/verify-html.mjs
DATABASE_URL=postgresql://TEST_USER:TEST_PASSWORD@localhost:5432/TEST_DB npm run verify:api
```

`verify-api.mjs`는 `wordstudy_verify_...` 임시 DB만 만들고 `finally`에서 삭제합니다. 운영 DB에 테스트 자료를 넣지 않습니다. 서비스 워커는 브라우저에서 별도로 확인합니다.

실제 Piper 검증은 모델 다운로드 후 TTS 이미지 안에서 실행합니다. 다음 명령은 테스트용 별도 문장 캐시 폴더를 사용하며 모델·캐시가 Git에 들어가지 않도록 합니다.

```bash
cd wordStudy_
python3 scripts/download-model.py /tmp/wordstudy-models
mkdir -p /tmp/wordstudy-cache
podman build -t localhost/wordstudy-tts-check -f tts/Containerfile tts
podman run --rm --userns=keep-id \
  -v /tmp/wordstudy-models:/models:ro \
  -v /tmp/wordstudy-cache:/cache \
  -v "$PWD/tts/service.py:/service/service.py:ro" \
  -v "$PWD/scripts/verify-tts.py:/verify.py:ro" \
  -e TTS_SERVICE_PATH=/service/service.py \
  localhost/wordstudy-tts-check python /verify.py
```

`verify-tts.py`는 비어 있는 테스트 캐시에서 시작하세요. 일반 운영 캐시를 지울 필요는 없습니다.

화면 검증은 저장소 루트에서 fixture 서버를 띄운 뒤 별도 터미널에서 실행합니다. 기본 Chrome 경로는 Linux Google Chrome이며 `CHROME_PATH`로 바꿀 수 있습니다. 실제 Google 로그인과 음성 출력은 이 fixture로 검증하지 않습니다.

```bash
python3 wordStudy_/scripts/browser-preview.py
# 별도 터미널
npm install --prefix /tmp/wordstudy-browser playwright
PLAYWRIGHT_MODULE=file:///tmp/wordstudy-browser/node_modules/playwright/index.mjs \
  node wordStudy_/scripts/verify-browser.mjs
```

스크린샷은 `docs/images/`에 갱신됩니다. 앱 서비스 워커 업데이트는 기존 창을 모두 닫은 후 적용됩니다.
