# 영어 대화 연습 · English Conversation Practice

영어 대화를 읽고 듣고 내 역할을 연습하는 한국어 학습 도구입니다. 재생은 브라우저의 음성 합성(`speechSynthesis`)을 사용합니다. React 서버 버전은 로그인 없이 공개 자료를 재생하고, 등록한 Google 관리자만 자료를 가져오거나 갱신합니다. HTML 버전은 기기에서 JSON 자료를 직접 엽니다.

![React 버전 학습 화면](docs/images/react-desktop.png)

| 구분 | HTML 버전 | React 서버 버전 |
| --- | --- | --- |
| 위치 | [`htmlVersion/`](htmlVersion/) | [`wordStudy_/`](wordStudy_/) |
| 실행 | HTML 직접 열기 또는 정적 서버 | Node 24·Fastify·PostgreSQL 17, Podman Compose |
| 자료 | JSON 폴더·내장 자료·정적 목록 | DB·관리자 JSON 가져오기 |
| 진도 | 브라우저별 저장 | 익명은 브라우저별, Google 로그인은 계정별 DB |
| 관리 | 기기에서 선택한 파일 읽기 | `/administration`에서 인증·권한 검사 |
| 화면 | [PC](docs/images/html-desktop.png) · [모바일](docs/images/html-mobile.png) | [PC](docs/images/react-desktop.png) · [모바일](docs/images/react-mobile.png) |

## 실행

### HTML 버전

```bash
cd htmlVersion
python3 -m http.server 8765 --bind 127.0.0.1
```

[http://localhost:8765/conversation.html](http://localhost:8765/conversation.html)을 엽니다. 파일을 직접 열 때는 같은 폴더의 `study.js`도 함께 보관하고 내장 자료 또는 **JSON 폴더 열기**를 사용합니다.

정적 서버는 `lessons.json`을 우선 사용하고 목록이 없으면 디렉터리 목록을 탐색합니다. 새 자료를 Git에 추가한 뒤 저장소 루트에서 `python3 scripts/update-html-manifest.py`로 목록을 갱신하세요. 이 명령은 Git이 추적하는 JSON만 포함합니다. HTML 자료와 React의 seed·DB는 자동 동기화하지 않습니다.

### React 서버 버전

Podman, Compose 제공자, OpenSSL이 필요합니다. 처음 설치·빌드할 때는 인터넷이 필요합니다.

```bash
cd wordStudy_
sh ./start.sh
```

[http://localhost:43871](http://localhost:43871)에서 시작합니다. 설정이 없으면 가져오기는 꺼집니다. 실행 스크립트는 기존 `.env`와 DB 암호를 유지하며 없는 세션 비밀값만 추가합니다.

- 포트: `.env`의 `WORDSTUDY_PORT`, 기본 43871
- DB 볼륨: `wordstudy-data` 유지. **`down -v` 또는 볼륨 삭제 금지**
- 같은 네트워크의 기본 재생: `http://PC_IP:43871`
- 모바일 Google 로그인·화면 유지 기능은 HTTPS 운영 주소를 사용하세요.
- 소스 변경을 적용하려면 `start.sh`로 다시 빌드합니다.

Google 관리자 설정과 운영 명령은 [서버 설정 안내](wordStudy_/README.md)를 참조하세요.

## 학습 기능

- **속도:** 0.5~1.5, 기본 0.95. 브라우저 음성 합성의 `rate`에 전달하며 변경한 값은 다음 문장부터 적용합니다. 음성과 OS에 따라 실제 빠르기는 다를 수 있습니다. [브라우저 속도 설정 문서](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate)
- **문장 반복:** 각 문장을 1~10회 반복합니다. 기본 1회입니다.
- **핵심 표현:** JSON의 `keyPhrase`와 일치하는 대사 부분을 강조합니다.
- **가리기:** 영어·해석을 각각 숨기고 **영어 보기**, **해석 보기** 버튼으로 공개합니다. 가려진 원문은 접근성 트리에 넣지 않습니다.
- **내 역할:** 내 화자의 대사는 같은 음성·속도로 **볼륨 0**으로 재생합니다. 해당 문장 아래 진행바가 나타나고, 음소거 재생이 끝나면 **3초를 더 기다린 뒤 자동으로 다음 문장**으로 넘어갑니다. 상대 대사는 평소 볼륨으로 재생합니다. 문장 반복 설정은 이 과정을 반복하며, 자료를 바꾸면 역할은 초기화됩니다.
- **진행바:** 브라우저 음성은 시작 전에 정확한 전체 길이를 제공하지 않으므로 음소거 재생 중에는 진행 중으로 표시합니다. 종료 이벤트에서 실제 재생 시간을 확인한 뒤 전체 시간에 3초를 더한 진행바를 채웁니다. 추가 시간 중 일시정지는 남은 시간을 유지하며, 음성 재생 중 일시정지는 이어 듣기 때 현재 문장 처음부터 다시 시작합니다. 정지·다음 문장·자료 변경은 이전 타이머를 취소합니다.
- **자료 선택·연속 재생:** 리스트에서 제목을 눌러 자료를 열고 체크한 자료만 이어 읽습니다. 중복 선택 콤보박스는 없습니다. 순서는 재생 바의 **다음 문장** 옆에서 아래→위 또는 위→아래로 선택합니다. 기본 아래→위이며 체크와 순서는 새로고침 후에도 남습니다.
- **학습 설정:** 재생 바 맨 오른쪽 **학습 설정** 버튼으로 팝업을 엽니다. 속도·문장 반복·가리기·내 역할·화면 유지를 조절하며, 닫기·Esc·팝업 바깥 클릭으로 닫습니다.
- **상단 메뉴·테마:** 화면 맨 위에 **대화연습 / 문장읽기**와 테마 선택을 배치합니다. 별도의 영어 대화 연습 제목은 표시하지 않습니다.
- **진도:** 일시정지 후 현재 문장 처음부터 이어 읽습니다. 정지·끝까지 재생하면 첫 문장으로 돌아갑니다. 정지 버튼은 페이지 최상단 대신 현재 단어·숙어 제목이 화면 위에 보이도록 스크롤합니다. React의 스페이스바 제어는 입력란·대화상자의 기본 동작을 유지합니다.
- **React 대화연습 반복 재생:** 재생 바의 **반복 재생**을 켜면 선택한 자료를 지정한 방향으로 끝까지 읽고 처음부터 다시 재생합니다. 선택한 자료가 없거나 현재 자료가 선택 목록 밖이면 현재 자료를 반복합니다. 재생 중에도 반복을 켜거나 끌 수 있으며, 정지 버튼으로 즉시 멈춥니다. `htmlVersion/`에는 이 대화연습 반복 옵션이 없습니다.
- **문장읽기:** 원문 붙여넣기·반복·속도·화면 유지와 브라우저에 원문 저장을 지원합니다.

화자 음성은 기기가 제공하는 영어 음성에서 배정합니다. 사용할 음성이 없으면 재생을 비활성화합니다. **재생 중 화면 유지**는 자동 화면 꺼짐을 줄이며 화면 잠금·백그라운드 재생을 보장하지 않습니다.

## 관리자 가져오기

일반 학습 화면에는 관리·로그인 링크가 없습니다. 주소로 `/administration`에 직접 접속하여 Google 로그인 후 표시되는 Google ID(`sub`)를 운영자가 config에 등록해야 가져오기 버튼이 보입니다. 관리 API도 서버에서 권한·CSRF를 검사합니다.

- 기본 **변경된 자료 갱신·진도 유지**, 선택 **기존 자료 건너뛰기**
- 정규화한 내용 해시가 같으면 변경 없음. JSON 공백·파일 수정 시각만 바뀌면 갱신하지 않습니다.
- 폴더 경로가 달라도 파일명이 같으면 같은 ID입니다. 같은 가져오기 묶음의 중복 파일명은 충돌로 표시합니다.
- 진도는 동일 화자·텍스트 문장으로 옮기고, 없으면 기존 문장 번호를 새 범위 안으로 보정합니다.
- seed는 없는 자료만 추가하며 기존 DB 자료를 자동 교체하지 않습니다.
- 기존 공동 `local` 진도는 보존하고, 관리자는 **기존 공동 진도 복사**로 자신의 계정에 한 번 복사할 수 있습니다.

## JSON 형식

```json
{
  "title": "Make a point",
  "date": "2026-11-17T09:00:00+09:00",
  "description": ["요점을 분명하게 말하기"],
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

`title`, `conversations`, 각 대화의 `lines`, 각 문장의 `speaker`·`text`가 필수입니다. `description`은 문자열·문자열 배열, `meaning`은 선택입니다. `keyPhrase`는 문자열·문자열 배열이며 대사에서 강조합니다. 날짜가 없으면 파일 수정 시각을 사용합니다. 위 형식의 학습 내용만 읽으며 그 밖의 추가 필드는 처리하지 않습니다.

## 개발·검증

```bash
cd wordStudy_
npm ci
npm run build       # 타입 검사·미사용 코드 검사·프런트 빌드
npm run verify
node scripts/verify-html.mjs
# 전용 테스트 PostgreSQL: 임시 DB 생성 권한 필요
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/TEST_DB npm run verify:api
```

Node 24 이상과 PostgreSQL 17을 사용합니다. GitHub Actions에서도 빌드와 검증을 실행합니다. [검증 기록](docs/verification.md)에 화면 검증 방법과 실제 기기가 필요한 검사를 구분했습니다.

코드는 [MIT](LICENSE)이며 학습 자료는 [별도 권리 안내](THIRD_PARTY_NOTICES.md)를 따릅니다. GitHub 소개 문안은 [저장소 소개안](docs/repository-about.md)에 있습니다.
