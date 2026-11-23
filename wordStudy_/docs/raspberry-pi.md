# 라즈베리파이 서버 배포

`wordStudy_/`는 React 빌드 결과와 Fastify 백엔드를 하나의 앱 컨테이너에서 제공하고 PostgreSQL 17을 별도 컨테이너에서 실행합니다. 기본 웹 포트는 TCP 43871입니다. `htmlVersion/`은 별도 정적 실행 방식이며 이 배포 대상이 아닙니다.

## 설치와 실행

라즈베리파이 ARM64에서 Podman과 `podman-compose`, OpenSSL이 필요합니다. 소스를 `~/apps/wordstudy/wordStudy_/`에 배치한 뒤 실행합니다.

```bash
cd ~/apps/wordstudy/wordStudy_
sh ./start.sh
curl -fsS http://127.0.0.1:43871/api/health
podman compose -p wordstudy ps
```

`start.sh`는 React를 빌드하고 백엔드·DB를 실행합니다. `.env`가 없으면 서버 전용 DB 암호와 세션 비밀값을 생성합니다. 기존 `.env`와 `wordstudy-data` 볼륨은 유지해야 합니다. 저장소의 `seed/` 자료는 초기 실행 시 읽지만 다른 컴퓨터의 DB에만 저장된 자료·진도는 자동 복사하지 않습니다. 별도 데이터 이전 시에는 원본을 보존하고 백업·복원 절차를 사용하세요.

관리자 등록 기능이 필요하면 [운영 안내](../README.md)의 관리자 인증 설정을 적용합니다. 비밀 설정을 Git에 추가하지 마세요. `PUBLIC_ORIGIN`은 실제 외부 접속 주소로 지정하고 공개 운영에서는 HTTPS를 구성하세요.

## 방화벽과 외부 접속

UFW를 사용하는 서버에서는 웹 포트를 허용합니다.

```bash
sudo ufw allow 43871/tcp
```

공유기의 외부 TCP 80을 라즈베리파이 유선 IP의 TCP 43871로 포워딩할 수 있습니다. 공유기 DHCP 고정 할당과 포워딩 대상 IP가 실제 `ip -4 address show eth0`의 주소와 같은지 확인하세요. 와이파이 공유용 주소가 `192.168.76.1`이면 내부 접속은 `http://192.168.76.1:43871`입니다. PostgreSQL 포트는 외부에 공개하지 않습니다.

## 부팅 시 자동 시작

`~/.config/systemd/user/wordstudy.service`를 다음 내용으로 만듭니다.

```ini
[Unit]
Description=WordStudy React 및 Fastify PostgreSQL 서비스
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=%h/apps/wordstudy/wordStudy_
ExecStart=/usr/bin/podman compose -p wordstudy up -d
ExecStop=/usr/bin/podman compose -p wordstudy stop
TimeoutStartSec=180
TimeoutStopSec=120

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now wordstudy.service
sudo loginctl enable-linger "$USER"
```

이미지 빌드는 `start.sh`에서 수행합니다. 자동 시작은 만들어진 이미지와 기존 볼륨을 사용합니다. 관리자 설정을 바꿨다면 `sh ./start.sh`로 다시 적용하세요.

```bash
systemctl --user status wordstudy.service
podman compose -p wordstudy logs --tail=50 app
# 데이터를 보존하고 중지
systemctl --user stop wordstudy.service
```

`podman compose down -v`나 `podman volume rm wordstudy-data`는 학습 데이터를 삭제하므로 사용하지 않습니다.

## 도메인 없이 공인 IPv4로 HTTPS 사용

Let's Encrypt의 공인 IP 인증서는 약 6일간 유효하므로 자동 갱신이 필요합니다. webroot 인증에는 Certbot 5.4 이상이 필요합니다. Ubuntu 저장소 버전이 오래된 경우 설치 스크립트는 공식 Certbot Snap을 사용합니다.

1. 공유기에서 외부 TCP 80 → 라즈베리파이 TCP 80, 외부 TCP 443 → 라즈베리파이 TCP 443으로 설정합니다. 이전 외부 80 → 내부 43871 규칙을 수정하세요.
2. 서버로 `scripts/setup-ip-https.sh`를 복사하고 실행합니다.

```bash
sudo bash ~/setup-ip-https.sh 공인IPv4
```

스크립트는 `sudo`를 실행한 사용자의 `~/apps/wordstudy/wordStudy_/`를 대상으로 합니다. 다른 계정에서 실행한다면 두 번째 인자로 앱 계정을 지정하세요. 설치 전 `.env`와 기존 Nginx 설정을 `/root/wordstudy-https-backup-날짜-시간/`에 백업합니다.

Nginx는 80에서 인증 파일을 제공하고 443에서 기존 앱의 43871로 전달합니다. 인증 사전 검증에 성공하면 정식 인증서를 발급하고, HTTP를 HTTPS로 이동시키며, 앱의 `PUBLIC_ORIGIN`을 `https://공인IPv4`로 변경합니다. DB 볼륨은 삭제하지 않습니다. 앱을 재생성하는 동안 잠시 접속이 중단될 수 있습니다.

관리자 인증·쿠키는 HTTPS 주소를 기준으로 동작하므로 이후 해당 HTTPS 주소를 사용하세요. IP 인증서는 사설 주소 `192.168.76.1`에 유효하지 않습니다. 외부 공인 IP 접속에는 공유기의 NAT loopback 지원이 필요할 수 있으므로 최종 외부 검증은 모바일 데이터로 수행합니다.

```bash
sudo certbot certificates --cert-name wordstudy-ip
systemctl status wordstudy-certbot-renew.timer
sudo nginx -t
```

6시간 간격으로 갱신 시기를 확인하고 인증서가 갱신되면 Nginx를 다시 불러옵니다. 외부 80번 포트는 갱신 검증을 위해 유지하세요. 공인 IP가 바뀌면 인증서와 `PUBLIC_ORIGIN`도 새 IP로 갱신해야 합니다. 비밀키·인증서는 `/etc/letsencrypt/`에 보관하며 저장소에 추가하지 않습니다.

참고: [Let's Encrypt의 Certbot IP 인증서 공식 안내](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)

## 영어 학습 자료 전체 교체

`scripts/replace-lessons.mjs`는 지정한 JSON 폴더를 검증한 뒤 하나의 트랜잭션으로 DB의 영어 학습 자료 목록을 교체합니다. 폴더에 없는 기존 자료는 삭제하며, 같은 파일명의 자료는 학습 횟수·암기 상태를 유지하고 진도를 새 문장에 맞춥니다. 삭제된 자료의 관련 진도·완료 기록은 함께 삭제됩니다. 로그인 세션·관리자 설정·DB 볼륨은 변경하지 않습니다.

운영 DB를 먼저 `pg_dump -Fc`로 백업하고, 별도 임시 DB에서 검증한 뒤 적용하세요. JSON 폴더와 스크립트가 앱 컨테이너에 있어야 합니다. 예를 들어 JSON을 `/tmp/wordstudy-json-refresh`, 스크립트를 `/app/scripts/replace-lessons.mjs`에 복사했다면 다음처럼 실행합니다.

```bash
podman exec wordStudy_ node --experimental-transform-types \
  scripts/replace-lessons.mjs /tmp/wordstudy-json-refresh --apply
```

실패하면 트랜잭션 전체를 롤백합니다. 빈 폴더는 거부합니다. 실행 중 자료 관리 작업은 피하세요. 재시작 시 과거 seed 자료가 다시 추가되지 않도록 서버 소스의 `seed/`도 같은 JSON 목록으로 교체한 뒤 앱 이미지를 다시 빌드하고 앱을 재생성하세요. 앱 컨테이너의 `node` 사용자가 읽을 수 있도록 seed 디렉터리는 755, JSON 파일은 644 권한을 지정합니다. 기존 seed는 DB 백업과 함께 별도 보관합니다. `htmlVersion/json/`의 원본 파일은 보존하며, HTML 정적 실행 방식에는 DB 교체가 적용되지 않습니다.

2026-11-23 적용 검증: 별도 임시 DB에서 전체 등록에 성공했고, 운영 서버 앱을 재생성한 뒤 `/api/health` 정상 응답과 `/api/lessons`의 84개 자료·852개 대화·1,901개 문장을 seed JSON과 전체 대조했습니다. 로그인 세션 수 유지와 `pg_restore --list`를 통한 백업 형식 검증도 통과했습니다.


## 도메인 첫 화면과 영어 학습 경로

`rp-yoon.duckdns.org` 운영 환경은 다음과 같이 설정합니다.

```dotenv
PUBLIC_ORIGIN=https://rp-yoon.duckdns.org
APP_BASE_PATH=/enWordStudy
```

`PUBLIC_ORIGIN`에는 경로를 붙이지 않습니다. `APP_BASE_PATH`는 프런트 빌드와 백엔드에 모두 적용되므로 변경 후 `sh ./start.sh`로 다시 빌드·재생성합니다. Nginx는 기존처럼 요청 경로를 유지하여 앱으로 전달합니다.

- 블로그 첫 화면: `https://rp-yoon.duckdns.org/` — “태환 블로그” 표시
- 영어 학습: `https://rp-yoon.duckdns.org/enWordStudy` — 끝에 `/`가 붙은 주소로 이동
- 관리자: `https://rp-yoon.duckdns.org/enWordStudy/administration`
- API 상태: `https://rp-yoon.duckdns.org/enWordStudy/api/health`

Google 인증을 사용하는 경우 Google Cloud의 승인된 리디렉션 URI에도 `https://rp-yoon.duckdns.org/enWordStudy/api/auth/callback`을 등록합니다. 로컬 관리자 로그인은 별도 외부 설정 변경이 없습니다. `APP_BASE_PATH`가 비어 있으면 기존 루트 배포 방식을 유지합니다. `htmlVersion/`의 정적 실행 주소에는 영향을 주지 않습니다.

2026-11-23 경로 배포 검증: 타입 검사·하위 경로 프런트 빌드·`npm run verify`·`APP_BASE_PATH=/enWordStudy` 관리자 로그인/권한/CSRF 검증을 통과했습니다. 운영 HTTPS 도메인에서 블로그 문구, `/enWordStudy`의 308 이동, JS/CSS 응답, 관리자 페이지, 인증·상태 API와 학습 자료 84개·문장 1,901개를 확인했습니다.
