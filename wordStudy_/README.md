# React 서버 버전 운영 안내

Node 24·React·Fastify·PostgreSQL 17 버전입니다. 서버 없이 쓰는 `../htmlVersion/`과 실행 방식이 다릅니다. 학습 UI와 JSON 형식은 [루트 README](../README.md)를 참조하세요.

라즈베리파이 설치·방화벽·부팅 자동 실행은 [배포 안내](docs/raspberry-pi.md)를 참조하세요.

## 시작·중지

```bash
sh ./start.sh
podman compose -p wordstudy ps
podman compose -p wordstudy logs -f app
curl -fsS http://localhost:43871/api/health
# 자료·진도 볼륨을 보존하며 중지
podman compose -p wordstudy stop
```

기존 `.env`의 DB 암호를 보존하세요. `start.sh`는 앱·DB 컨테이너를 재생성하고 마이그레이션을 적용하며 `wordstudy-data` 볼륨을 삭제하지 않습니다. `down -v`는 사용하지 마세요. DB 포트는 호스트에 공개하지 않습니다.

## 관리자 인증과 자료 등록

`/administration`은 로그인 전에는 아이디·비밀번호 입력 화면만 표시합니다. 로그인 후에는 등록된 리스트, JSON 파일 등록, JSON 폴더 등록과 로그아웃만 표시하며 자료 내용·학습 메뉴·재생바는 표시하지 않습니다. 일반 학습 화면은 `/`입니다. `htmlVersion/`은 별도의 정적 실행 방식이며 이 서버 인증을 사용하지 않습니다.

관리자 설정은 Git에서 제외되는 `wordStudy_/.env`에 `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`로 저장합니다. 비밀번호는 무작위 salt를 사용하는 scrypt 해시(`salt:hash`)로만 저장하며 평문은 기록하지 않습니다. 아이디는 로그인 비교를 위한 일반 설정입니다. `SESSION_SECRET`은 `start.sh`가 없을 때 생성합니다. 인증 설정을 변경한 뒤 `sh ./start.sh`로 적용합니다. 기존 DB 암호와 볼륨은 보존하세요.

`start.sh`는 관리자 인증 설정이 있으면 파일 등록을 활성화합니다. Compose를 직접 실행한다면 `ENABLE_IMPORT=1`을 설정해야 합니다. 세션은 7일간 유효하고 HttpOnly·SameSite=Lax 쿠키를 사용합니다. 로그인 실패는 IP별 15분 동안 5회까지 허용합니다. 파일 등록·로그아웃에는 동일한 Origin과 CSRF 토큰이 필요합니다. 외부 서비스에서는 HTTPS와 일치하는 `PUBLIC_ORIGIN`을 설정하세요.

기존 Google OAuth API는 호환성을 위해 유지하지만 관리자 화면에서 Google 설정은 필요하지 않습니다.

## 개발

```bash
npm ci
npm run build
npm run verify
```

Vite 개발 서버는 `/api`를 43871 백엔드로 프록시합니다. 관리자 인증·CSRF·쿠키를 함께 확인하려면 빌드 결과를 백엔드에서 제공하는 같은 origin으로 접속하세요. 백엔드 직접 실행 시 `DATABASE_URL`을 설정하고 `npm start`를 사용합니다. DB 없이 프런트 화면만 확인하려면 저장소 루트에서 `python3 wordStudy_/scripts/browser-preview.py`를 실행합니다. 이 서버는 seed fixture와 인증 꺼짐 응답만 제공하며 운영 서버가 아닙니다.

### 제공하는 API

- `POST /api/auth/login` (아이디·비밀번호), `GET /api/auth/session`, `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`
- `POST /api/import`: `name`, `modified`, `data`, 선택 `policy: update|skip`; 결과 `added|updated|unchanged|skipped`
- `PUT /api/progress`: 로그인 계정의 `id`, `position`; 익명은 브라우저에 저장
- `POST /api/admin/claim-progress`: 관리자 자신의 기존 공동 진도 복사

상태를 변경하는 인증 요청에는 동일한 Origin과 세션에서 받은 `X-CSRF-Token`이 필요합니다. OAuth 토큰·클라이언트 비밀값은 브라우저 저장소에 넣지 않습니다.

## 코드·데이터 유지보수

### 단어·숙어 강조 (React 버전)

영어 문장의 `keyPhrase`가 있으면 해당 표현을, 없으면 학습 자료의 메인 `title`을 강조 대상으로 사용합니다. 단어 단위로 비교하며 규칙 변화(과거형·진행형·복수형 등), 내장 목록의 불규칙 변화, 숙어의 `one's` 소유격과 `oneself` 재귀대명사 변형을 브라우저에서 처리합니다. 외부 API나 인터넷 연결은 필요하지 않습니다. 원문 철자·띄어쓰기·문장부호는 유지합니다.

예를 들어 `foot the bill`은 `footed the bill`을, `sink one's teeth into`는 `sank her teeth into`를 강조합니다. 다크 테마는 황금색 `#FBBF24`, 밝은 테마는 `#92400E`와 볼드체 700을 사용합니다. 복잡한 의역, 단어가 삽입되거나 분리된 숙어, 목록에 없는 불규칙형은 자동 인식하지 않을 수 있으며 이때 문장별 `keyPhrase`에 실제 표현을 지정할 수 있습니다. 문맥에 따른 품사·의미 구분은 하지 않습니다. 이 기능은 `wordStudy_/` React 서버 버전에만 적용되며 `htmlVersion/`은 별도의 정적 실행 방식입니다.

`npm run verify:highlight`로 변형 인식과 오탐 방지 사례를 검증합니다.

`could have + PP`처럼 과거분사 자리를 포함하는 문형도 지원합니다. `PP`, `p.p.`, `p. p.`를 과거분사 자리로 처리하며, `could have done`, `could have worked`, `could’ve gone` 등을 강조합니다. `would/should/might/must have + PP`에도 같은 규칙이 적용됩니다. 규칙형 `-ed`와 내장 불규칙 과거분사 목록을 사용하므로 인터넷이 필요하지 않습니다. 문형 사이에 부사가 삽입된 경우나 목록에 없는 불규칙 과거분사는 인식하지 못할 수 있습니다.

기본 조동사 완료 문형은 `could not have done`, `couldn’t have finished` 같은 부정형과 `Could you have left` 같은 대명사 주어 의문형도 인식합니다. `I could have.`처럼 과거분사가 생략된 문장은 PP가 없으므로 이 규칙에서는 강조하지 않습니다.

제목의 `/`(또는 `／`)는 대안 구분자로 사용합니다. `denote / denoting`은 두 표현과 그 규칙 변화를 각각 찾으며, `take off / give up`처럼 숙어 대안도 지원합니다. `~`, `～`, `〜`는 실제 글자로 비교하지 않습니다. 앞뒤의 물결표는 생략하고, 중간의 물결표는 같은 문장 안에서 최대 24단어의 생략 자리로 처리합니다. `It comes after ~`는 긴 주어 뒤의 `comes after`에도 대응합니다.

영문·한글 문법 표기는 다음과 같이 자리표시자로 처리합니다. `+`는 구분 기호입니다.

| 자리 | 지원 표기 |
| --- | --- |
| 명사·명사구 | noun, n., N, 명사, noun phrase, NP, 명사구 |
| 주어·동사·목적어·보어 | subject/주어/S, verb/동사/V, object/목적어/O, complement/보어/C |
| 대명사 | pronoun, 대명사 |
| 형용사·부사 | adjective/adj/형용사, adverb/adv/부사 |
| 전치사·접속사·감탄사 | preposition/prep/전치사, conjunction/conj/접속사, interjection/interj/감탄사 |
| 한정사·관사 | determiner, det, 한정사, 관사 |
| 분사·동명사·부정사 | PP/p.p./past participle/과거분사, present participle/현재분사, gerund/동명사, infinitive/부정사 |

예를 들어 `be up for + noun`은 `is still up for debate`, `you’re up for a promotion`, `Are you up for dinner`를, `That's what + 주어 + 동사 ~ as they explain ~`은 `That’s what customers tell me as they explain`을 강조합니다. 뒤의 `as he explains` 같은 대명사·동사 변화도 인식합니다. 문형의 고정 표현과 자리의 범위를 함께 강조하며 원문은 바꾸지 않습니다.

이 기능은 문형 표기를 해석하는 오프라인 규칙이며 문장의 품사를 완전히 분석하는 도구는 아닙니다. 명사구·주어·동사 등은 최대 8단어 안에서 고정 표현과 문장부호를 기준으로 추정하므로 복잡한 문장에서는 과소·과다 강조가 생길 수 있습니다. 자리표시자만 있는 제목은 모든 문장을 강조하지 않도록 제외합니다. 예외는 실제 표현을 문장별 `keyPhrase`로 지정해 보완하세요.

일반 숙어는 핵심 단어의 순서를 유지하면서 내용어 앞에 삽입된 관사·정도 표현·내장 목록의 수식어를 최대 6단어까지 허용합니다. `put pressure on`은 `put a lot of pressure on`, `put so much pressure on`, `put extra pressure on`을, `a punch in the gut`은 `a total/real/huge/tough punch in the gut`을 강조합니다. 삽입된 수식어까지 함께 강조하며 문장부호나 별도 절을 건너뛰지는 않습니다. 모든 임의의 삽입을 허용하는 것은 아니며, 목록에 없는 수식어는 `keyPhrase`로 지정해 보완할 수 있습니다.

`npm run build`는 TypeScript의 미사용 선언·매개변수 검사도 실행합니다. 현재 직접 의존성은 React·Fastify·PostgreSQL 접근과 프런트 빌드에 필요한 패키지로 구성됩니다.

적용된 `drizzle/` 마이그레이션 이력은 수정하지 않습니다. 과거 DB에 남은 추가 메타데이터 열은 보존하지만 현재 ORM 스키마·API·가져오기에서는 읽거나 갱신하지 않습니다. 기존 학습 JSON과 진도 데이터는 그대로 유지합니다.

과거 버전의 서비스 워커가 브라우저에 남은 경우에는 해당 등록만 수동 해제합니다. 진도·체크·원문이 있는 브라우저 저장소 전체를 지울 필요는 없습니다.

파일·폴더 등록은 파일명과 관계없이 메인 `title`을 먼저 비교하고, `conversations`의 제목을 순서대로 비교합니다. 대화 개수와 모든 제목이 같으면 본문·날짜가 달라도 `skipped`로 건너뜁니다. 제목 목록이 다르면 기존 파일명에 대한 `update|skip` 정책을 적용하고, 새 파일명은 등록합니다.

대화 목록의 `Memorized` 체크박스는 공통 암기 상태를 DB에 저장합니다(기본 false). 미암기 자료가 위에, 암기 자료는 `Memorized` 구분선 아래에 표시되며 각 영역의 기존 날짜 정렬을 유지합니다. 체크 해제 시 위 영역으로 돌아갑니다. 공개 학습 화면에서도 변경할 수 있고 새로고침·재시작·자료 갱신 후 유지됩니다. `PUT /api/memorized`는 `{ id, memorized }`를 받으며 동일 출처 요청만 허용합니다.
