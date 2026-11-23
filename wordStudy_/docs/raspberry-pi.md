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
