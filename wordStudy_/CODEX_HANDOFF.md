# VS Code Codex 작업 인계 · wordStudy_

## 후속 진행 결과 (2026-11-14)

- 실제 PC에서 Podman 5.7.0 / podman-compose 1.5.0 실행을 확인했다. 제한된 실행 환경에서는 Podman·Snap Node가 막혀 실제 PC 권한으로 명령을 실행했다.
- `package-lock.json`을 생성했고 Containerfile을 `npm ci`로 변경했다. Node 24 컨테이너에서 타입 검사와 Vite 빌드를 통과했다.
- 앱 `wordStudy_`와 DB `wordstudy-db`가 실행 중이며 DB는 healthy이다. 포트는 기본 43871, 영속 볼륨은 `wordstudy-data`를 유지했다. 기존 `.env`를 보존했다.
- PC URL: `http://localhost:43871`, 같은 와이파이의 휴대폰 URL: `http://192.168.0.2:43871`. PC에서 루프백과 내부 IP의 상태 API 응답을 확인했다.
- `scripts/verify-api.mjs`로 별도 임시 DB에서 자료 22개·대화 222개·문장 430개, JSON 가져오기·교체·입력 검증, 진도 저장과 서버 재시작 후 보존을 검증했다. 테스트 DB는 정리했다.
- 앱과 DB 컨테이너 재생성 후 전체 자료·진도 응답이 동일했고 HTML·번들 자산 제공도 통과했다. 볼륨은 삭제하지 않았다.
- **남은 수동 검증:** 브라우저 제어 서비스가 연결 불가이므로 대화 선택, 원문·뜻, 문장부터 재생, 일시정지·재개, 정지, 현재 문장 강조, 새로고침 후 이어 듣기를 실제 브라우저에서 확인해야 한다. 실제 휴대폰 접속·TTS 음성 확인도 남아 있다.
- 재실행: `sh ./start.sh`. API 재검증: `podman exec -i wordStudy_ node --input-type=module < scripts/verify-api.mjs`.

아래는 최초 인계 시점의 목표와 진행 지침이다.

## 목표

기존 구현을 이어서 실제 PC의 Podman에서 앱을 빌드하고 실행한다. PC와 같은 와이파이에 연결한 휴대폰에서 영어 대화 자료를 열고 재생할 수 있는 상태까지 확인한다. 실행 중 발견한 오류는 프로젝트에서 수정한 뒤 다시 검증한다.

## 프로젝트 위치와 현재 상태

- VS Code에서 `/run/media/thyoon7043/data/myData/English/단어 공부/wordStudy_`를 연다. 다른 경로에 압축을 풀었다면 `Containerfile`과 `compose.yaml`이 있는 폴더를 작업 루트로 삼는다.
- 기존 HTML 참고 자료는 상위 폴더의 `htmlVersion/conversation.html`과 `htmlVersion/json/`에 있다. 앱 빌드에 필요한 초기 JSON 22개는 이미 `seed/`에 복사되어 있다.
- 프론트엔드는 React + Vite + TypeScript + Tailwind CSS, 백엔드는 Node.js + Fastify, DB는 PostgreSQL + Drizzle이다. Containerfile, Compose 설정, 초기 마이그레이션, 실행 스크립트가 작성되어 있다.
- 이전 환경에서는 JSON 22개, 대화 222개, 문장 430개를 파싱했고 TypeScript·TSX 구문, 셸 구문, Compose YAML을 확인했다. 의존성 설치, 타입 검사, 전체 빌드, DB 연결, 브라우저 검증은 남아 있다. 이전 환경의 Podman은 `/run/user/1000/libpod`가 읽기 전용이어서 실패했고 npm 레지스트리 DNS도 사용할 수 없었다. VS Code 터미널에서 현재 상태를 다시 확인한다.

## 진행 순서

1. **실행 환경 확인.** `podman info`, `podman compose version`, `podman ps -a`, `ss -ltn`으로 Podman, Compose 제공자, 기존 컨테이너와 포트 점유를 확인한다. 기본 호스트 포트는 `43871`이다. 점유 중이면 앱에 사용할 빈 포트를 정해 `.env`의 `WORDSTUDY_PORT`만 바꾼다. 기존 볼륨이 있다면 연결된 DB와 `.env`를 먼저 확인하고 보존한다.
2. **빌드하고 고친다.** 루트에서 `sh ./start.sh`를 실행한다. 빌드가 실패하면 npm 의존성 및 버전, TypeScript 타입 오류, Tailwind/Vite 구성, 이미지 빌드 로그를 확인해 원인을 수정하고 재시도한다. 의존성 설치가 가능하면 해당 버전의 `package-lock.json`을 생성하고 Containerfile이 `npm ci`로 재현 가능한지 확인한다.
3. **서버와 DB를 확인한다.** 앱 컨테이너 `wordStudy_`, DB 컨테이너 `wordstudy-db`, 영속 볼륨 `wordstudy-data`를 사용한다. 외부에는 앱 포트만 공개한다. `podman compose -p wordstudy ps`, `podman compose -p wordstudy logs app db`, `curl -fsS http://127.0.0.1:43871/api/health`로 확인한다. 호스트 포트를 변경했다면 실제 포트를 적용한다. 새 DB에서는 `/api/lessons`가 초기 자료 22개를 반환하는지 확인한다.
4. **브라우저를 확인한다.** PC에서 대화 선택, 영어 원문과 뜻, 문장부터 이어 재생, 일시정지·재개, 정지, 현재 문장 강조를 확인한다. 테스트 JSON을 쓰려면 기존 자료와 다른 파일명을 사용하거나 별도 테스트 DB에서 같은 파일명 재가져오기를 확인한다. 진도가 새로고침과 컨테이너 재생성 후에도 남는지 확인한다. 검증 중에는 `down -v`나 볼륨 삭제를 사용하지 않는다.
5. **휴대폰 접속 확인.** PC의 와이파이 내부 IP를 확인해 `http://<PC 내부 IP>:<호스트 포트>`로 접속한다. PC에서 접근 가능하고 휴대폰에서 실패하면 포트 바인딩, 방화벽, 공유기의 기기 간 통신 설정을 점검한다. 실제 휴대폰을 사용할 수 없으면 접속 URL을 제공하고 휴대폰 검증을 별도로 표시한다. PC와 휴대폰의 TTS 음성 목록은 브라우저와 OS에 따라 달라진다.

## 유지할 조건

- 현재는 개인용이며 같은 와이파이에서 사용한다. PostgreSQL은 이후 웹 배포 시 `DATABASE_URL`로 관리형 DB에 연결할 수 있게 유지한다.
- Tailwind 스타일은 `src/main.tsx`와 `src/style.css`에서 수정할 수 있게 유지한다. 기존 HTML 폴더는 참고용으로 둔다.
- 현재 재생 위치는 로컬 사용자 한 명을 기준으로 공유한다. 다중 사용자 인증과 인터넷 공개는 이후 범위다.
- 실제 실행에 맞춰 README를 수정하고 최종 답변에 변경 파일, 실행 명령, PC·휴대폰 접속 URL, 기능별 검증 결과를 남긴다.
