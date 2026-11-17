# 영어 대화 연습 · English Conversation Practice

영어 대화를 읽고 듣고 따라 말하는 한국어 학습 도구입니다. 로그인 없이 공개 자료를 재생하고, 선택한 Google 관리자만 자료를 등록·갱신할 수 있습니다.

![React 버전 학습 화면](docs/images/react-desktop.png)

| 구분 | HTML 버전 | React 서버 버전 |
| --- | --- | --- |
| 위치 | [`htmlVersion/`](htmlVersion/) | [`wordStudy_/`](wordStudy_/) |
| 실행 | HTML 직접 열기 또는 정적 서버 | Node 24·Fastify·PostgreSQL 17, Podman Compose |
| 자료 | JSON 폴더·내장 자료·정적 목록 | DB·관리자 JSON 가져오기 |
| 진도 | 브라우저별 저장 | 익명은 브라우저별, Google 로그인은 계정별 DB |
| Google 관리 | 해당 없음: 기기에서 선택한 파일만 읽음 | `/administration`에서 인증·권한 검사 |
| 로컬 TTS | 서버에서 내보낸 음성 묶음 읽기 | 선택적 Piper 서비스로 생성·캐시 |
| 오프라인 | 저장한 JSON·음성 묶음, PWA 화면 | 저장한 자료·오디오, 계정별 진도 대기열 |

## 실행

### HTML 버전

```bash
cd htmlVersion
python3 -m http.server 8765 --bind 127.0.0.1
```

[http://localhost:8765/conversation.html](http://localhost:8765/conversation.html)을 엽니다. `conversation.html` 직접 열기도 지원합니다. 직접 열 때는 내장 자료 또는 **JSON 폴더 열기**를 사용하며 PWA 설치·서비스 워커는 작동하지 않습니다. 같은 폴더의 `study.js`를 함께 보관하세요.

정적 서버에서는 `lessons.json` 목록을 우선 사용하고 없으면 기존 디렉터리 목록을 탐색합니다. 새 자료를 Git에 추가한 뒤 저장소 루트에서 `python3 scripts/update-html-manifest.py`로 목록을 갱신하세요. 이 명령은 Git이 추적하는 JSON만 포함합니다. HTML과 React의 seed·DB 자료는 자동 동기화하지 않습니다.

### React 서버 버전

Podman, Compose 제공자, OpenSSL이 필요합니다. 최초 설치·빌드에는 인터넷이 필요합니다.

```bash
cd wordStudy_
sh ./start.sh
```

[http://localhost:43871](http://localhost:43871)에서 공개 학습을 시작합니다. 설정이 없으면 가져오기는 꺼집니다. `start.sh`는 기존 `.env`와 DB 암호를 유지하고, 없는 세션 비밀값만 추가합니다.

- 포트: `.env`의 `WORDSTUDY_PORT`, 기본 43871
- DB 볼륨: `wordstudy-data` 유지. **`down -v` 또는 볼륨 삭제 금지**
- 음성 캐시: 별도 `wordstudy-audio` 볼륨
- 같은 네트워크에서는 `http://PC_IP:43871`로 기본 재생이 가능합니다. 로그인·마이크·PWA·화면 유지의 모바일 운영에는 HTTPS 주소를 사용하세요.
- 기존 실행 중 앱에는 소스만 바꿔서는 반영되지 않습니다. 설정 후 `start.sh`로 다시 빌드합니다.

관리자 Google 인증과 선택적 TTS의 설정은 [서버 설정 안내](wordStudy_/README.md)를 따릅니다. 실제 비밀값을 예제 파일에 넣거나 커밋하지 마세요.

## 학습 기능

두 버전에서 속도 0.5~1.5, 피치 0.5~1.5, 문장 1~10회 반복, 문장 번호 A-B 무한 반복, 영어·뜻 가리기, 핵심 표현 강조, 검색·태그·난이도 필터, 밝게·어둡게·시스템 테마를 제공합니다. 기본 속도는 0.95, 피치는 1, 반복은 1회, 테마는 어둡게입니다.

- **연속 재생:** 체크한 자료만 읽습니다. 기본 아래→위이며 위→아래로 바꿀 수 있습니다. 체크·순서·설정은 새로고침 후에도 남습니다. 필터는 선택을 해제하지 않고 숨겨진 선택 개수를 표시합니다.
- **롤플레이:** 내 화자를 고르면 앱은 상대 대사만 읽고 내 차례에서 기다립니다. 말한 뒤 **다음 문장**을 누릅니다. 자료를 바꾸면 역할·A-B 범위는 초기화됩니다.
- **쉐도잉:** 문장의 **말해 보기**로 원문과 인식 문장을 비교합니다. 표시되는 값은 발음 점수가 아닌 단어 기준 **인식 문장 일치율**입니다. 브라우저에 따라 음성을 외부 서버에서 처리하므로 시작 전에 안내합니다. 인식 결과를 앱 서버에 저장하지 않습니다.
- **가리기:** 버튼으로 문장별 공개합니다. 가려진 원문은 화면과 접근성 트리에 넣지 않습니다.
- **진도:** 일시정지 후 현재 문장 처음부터 이어 읽습니다. 정지·끝까지 재생하면 첫 문장으로 돌아갑니다. React의 스페이스바 재생 제어는 입력란·대화상자의 기본 동작을 유지합니다.
- **문장읽기:** 원문 붙여넣기·반복·속도·피치·화면 유지, 브라우저에 원문 저장을 지원합니다.

화자별 브라우저 음성은 기기의 영어 음성 목록에서 배정합니다. 음성이 없으면 읽기를 비활성화합니다. 오프라인 브라우저 TTS는 기기에 설치된 오프라인 영어 음성이 필요합니다.

## 관리자 가져오기와 진도

`/administration`에서 Google 로그인 후 확인한 Google ID(`sub`)를 운영자가 config에 등록해야 가져오기 버튼이 보입니다. 일반 학습 화면에는 파일·폴더 가져오기를 표시하지 않습니다. 관리 API도 서버에서 권한·CSRF를 검사합니다.

- 기본 정책 **변경된 자료 갱신·진도 유지**, 선택 정책 **기존 자료 건너뛰기**
- 내용 해시가 같으면 변경 없음. JSON 공백·파일 수정 시각만 바뀌어도 불필요한 갱신을 하지 않습니다.
- 같은 묶음의 중복 파일명은 충돌로 표시합니다. 폴더 경로가 달라도 파일명이 같으면 같은 자료 ID입니다.
- 진도는 동일 화자·텍스트 문장으로 옮기고, 없으면 기존 문장 번호를 새 범위 안으로 보정합니다. 추가·갱신·변경 없음·건너뜀·실패 결과를 표시합니다.
- seed는 서버 시작 시 없는 자료만 추가합니다. 기존 DB 자료를 자동 교체하지 않습니다.
- 기존 공동 `local` 진도는 보존합니다. 관리 화면의 **기존 공동 진도 복사**로 관리자 자신의 계정에 한 번 복사할 수 있습니다.

## 모바일 음성과 오프라인

**화면 유지**는 화면이 켜진 상태에서 자동 꺼짐을 줄입니다. 백그라운드 `speechSynthesis` 재생을 보장하지 않습니다.

화면을 끄고 듣기 위해서는 관리자가 Piper로 선택 자료를 한 WAV 파일로 준비한 뒤 **생성 오디오**에서 재생합니다. 지원 환경에서 Media Session의 잠금 화면 제어를 연결합니다. 생성 실패 시 브라우저 TTS는 계속 사용할 수 있습니다. 실제 기기별 검증 현황은 [지원·검증 표](docs/verification.md)를 확인하세요.

생성 오디오의 속도는 즉시 적용하고 피치·문장 반복·A-B 범위는 생성 시 반영합니다. 롤플레이 사용자 대사는 무음으로 생성하고 화면이 켜진 동안 해당 차례에서 일시정지합니다. 백그라운드에서는 사용자 차례 자동 대기를 보장하지 않습니다. 무한 구간 반복은 완성된 구간 오디오의 loop로 처리합니다.

HTML에서는 **HTML용 음성 묶음 내보내기**로 받은 JSON을 **서버 음성 묶음 열기**로 불러옵니다. HTML 자체에는 TTS 서버가 필요하지 않습니다.

PWA는 localhost 또는 HTTPS에서 제공합니다. 앱 화면만 기본 캐싱하며 자료·오디오는 **오프라인 저장**한 것만 보관합니다. 용량 표시·저장 갱신·삭제·앱 업데이트 확인을 제공합니다. 인증·관리 API는 캐싱하지 않습니다. 로그인 사용자의 대기 진도는 같은 Google 계정으로 재연결했을 때만 반영합니다. 브라우저 저장소는 사용자·OS가 삭제할 수 있으므로 원본 자료를 별도로 보관하세요.

## JSON 형식

```json
{
  "title": "Make a point",
  "date": "2026-11-17T09:00:00+09:00",
  "description": ["요점을 분명하게 말하기"],
  "tags": ["work", "opinion"],
  "level": "B1",
  "conversations": [{
    "title": "회의",
    "lines": [{
      "speaker": "A",
      "text": "I'd like to make a point about the schedule.",
      "meaning": "일정에 관해 한 가지 말씀드리고 싶어요.",
      "keyPhrase": ["make a point"]
    }]
  }]
}
```

`title`, `conversations`, 각 대화의 `lines`, 각 문장의 `speaker`·`text`가 필수입니다. `description`은 문자열·문자열 배열, `meaning`은 선택입니다. 새 선택 필드 `tags`는 문자열 배열, `level`은 A1~C2, `keyPhrase`는 문자열 또는 문자열 배열입니다. 기존 JSON은 그대로 사용할 수 있습니다. date가 없으면 파일 수정 시각을 사용합니다. 음성은 영어 text만 읽습니다.

## 개발·검증

```bash
cd wordStudy_
npm ci
npm run build
npm run verify
node scripts/verify-html.mjs
# 전용 테스트 PostgreSQL URL. 검증 스크립트가 임시 DB를 생성·삭제합니다.
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/TEST_DB npm run verify:api
```

Node.js 24 이상을 사용합니다. API 검증에는 임시 DB 생성 권한이 필요합니다. GitHub Actions는 PostgreSQL 17 서비스와 같은 검증을 실행합니다. 모의 음성 엔진 검증, 실제 Piper 검증, 화면 검증의 범위와 재현 방법은 [검증 기록](docs/verification.md)에 구분했습니다.

코드는 [MIT](LICENSE)이며 기존 학습 JSON·내장 학습 자료·음성 모델은 별도입니다. [권리 안내](THIRD_PARTY_NOTICES.md)를 확인하세요. GitHub About·topics용 문안은 [저장소 소개안](docs/repository-about.md)에 준비되어 있습니다.
