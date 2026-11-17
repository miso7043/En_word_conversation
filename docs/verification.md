# 기능 단순화 검증 · 2026-11-17

서버 음성 생성·생성 오디오·오프라인 저장·태그·피치·A-B 구간 반복을 제거한 현재 버전을 기준으로 합니다. 스크린샷은 실제 Chrome에서 seed fixture를 연 화면입니다.

| 검사 | 결과·범위 |
| --- | --- |
| TypeScript·Vite | 프로덕션 빌드 통과 |
| 기존 재생 | 빠른 클릭·늦은 이벤트·정지·연속 재생·자동 시작 회귀 검증 통과 |
| 학습 재생 | 속도·다음 문장부터 속도 변경·문장 반복·롤플레이 대기/다음 검증 통과 |
| 이전 설정 호환 | 예전 피치·A-B 설정이 남아 있어도 적용하지 않고 정상 종료 |
| JSON·저장 | 기존 JSON·태그 필드 무시·난이도·핵심 표현·문장 진도 보정·저장소 차단 처리 통과 |
| Google 검증 | 테스트 RSA 키로 서명·발급자·대상·만료·nonce·발급 시각·sub 검증 통과 |
| PostgreSQL 17 통합 | 임시 DB에서 구형 스키마 업그레이드·기존 자료/진도 보존·권한·CSRF·동시 가져오기·롤백·진도 복사·재시작·로그아웃 통과 |
| 삭제 API | 음성 목록·생성·파일·내보내기 경로가 404인지 확인 |
| Chrome 화면 | 두 버전의 제거 항목 부재·제목 옆 테마·테마/선택 복원·제목 검색/대사 제외·가리기 확인 |
| 브라우저 음성 연결 | 모의 합성 엔진으로 UI 속도 값이 양쪽의 utterance.rate에 전달되는지 확인. 실제 청감 평가는 별도 |
| 마이크 예외 | 모의 음성 인식기의 마이크 거부 안내 확인 |
| 모바일 배치 | 390×844 뷰포트에서 양쪽 가로 넘침 없음 |
| 캐싱 종료 | 기존 서비스 워커를 갱신해 등록 해제하고 앱 셸 캐시를 정리. 새 캐싱 워커는 등록하지 않음 |
| 정적 파일·셸·CI | HTML·보조 JS·워커 구문·자료 manifest·셸 구문·Compose/Actions YAML 검사 |

기존 학습 JSON과 PostgreSQL 볼륨은 삭제하지 않습니다. DB의 기존 tags 열과 과거 음성 캐시 볼륨은 데이터 보존을 위해 남겨 두지만 앱에서 읽거나 사용하지 않습니다. 체크·설정·익명 진도·문장읽기 원문을 브라우저에 저장하는 기능은 유지합니다.

## 실제 계정·기기 검사

Google 실계정 로그인은 사용자의 OAuth 클라이언트 설정 후 확인해야 합니다. Android Chrome·iOS Safari의 실제 음성 빠르기, 마이크, Wake Lock은 실제 기기에서 확인해야 합니다. 자동 테스트가 실제 계정 인증이나 음성 품질을 보장하지 않습니다. 브라우저 음성 합성은 잠금 화면·백그라운드에서 중단될 수 있으며 별도 잠금 화면 제어는 제공하지 않습니다.

## 자동 검증 재현

```bash
cd wordStudy_
npm ci
npm run build
npm run verify
node scripts/verify-html.mjs
DATABASE_URL=postgresql://TEST_USER:TEST_PASSWORD@localhost:5432/TEST_DB npm run verify:api
```

Node 24와 PostgreSQL 17을 사용합니다. API 검증은 임시 DB 생성 권한이 필요하며 `wordstudy_verify_...` DB를 생성하고 종료 시 삭제합니다. 운영 자료를 테스트 DB로 복사하지 않습니다.

화면 검증은 저장소 루트에서 fixture 서버를 실행하고 별도 터미널에서 진행합니다.

```bash
python3 wordStudy_/scripts/browser-preview.py
# 별도 터미널
npm install --prefix /tmp/wordstudy-browser playwright
PLAYWRIGHT_MODULE=file:///tmp/wordstudy-browser/node_modules/playwright/index.mjs \
  node wordStudy_/scripts/verify-browser.mjs
```

기본 Chrome 경로는 Linux Google Chrome이며 `CHROME_PATH`로 바꿀 수 있습니다. 화면 검증은 모의 음성 엔진·마이크 예외와 서비스 워커 업그레이드까지 확인하고 `docs/images/`를 갱신합니다.
