# 코드·학습 자료·음성 모델의 권리 안내

루트 `LICENSE`의 MIT 허가는 이 저장소에서 작성한 앱 코드와 문서에 적용합니다. `htmlVersion/json/`, `wordStudy_/seed/`의 학습 자료, HTML에 내장된 학습 자료와 그로부터 생성한 음성은 이 허가의 대상에 포함하지 않습니다. 해당 자료의 재배포·상업 이용 권리는 각 원저작자의 조건을 확인해야 합니다. 기존 자료 전체에 새 라이선스를 소급 부여하지 않습니다.

npm 의존성은 각 패키지의 라이선스를 따릅니다. Piper는 앱과 별도 프로세스·선택적 컨테이너로 실행하며 이 저장소의 MIT 허가를 Piper에 적용하지 않습니다.

| 항목 | 고정 버전·출처 | 권리 안내 |
| --- | --- | --- |
| Piper | [v1.3.0](https://github.com/OHF-Voice/piper1-gpl/releases/tag/v1.3.0), `piper-tts==1.3.0` | GPL-3.0. 배포 시 해당 버전의 라이선스·소스 제공 조건을 준수해야 합니다. |
| 영어 모델 | `en_US-ljspeech-medium`, [고정 리비전](https://huggingface.co/rhasspy/piper-voices/tree/e9ab671f2a0e50a701b34361136ba3e6a3a9eb0c/en/en_US/ljspeech/medium) | 모델과 모델 카드는 Git에 포함하지 않으며 다운로드 시 함께 보관합니다. |
| 학습 데이터셋 | [LJ Speech](https://keithito.com/LJ-Speech-Dataset/) | 모델 카드의 Dataset 항목에 public domain으로 표시됩니다. 이 표시는 저장소의 다른 JSON 자료에 적용되지 않습니다. |
| FFmpeg | Debian bookworm 배포 패키지 | 빌드 구성에 포함된 LGPL/GPL 구성 요소의 조건을 따릅니다. |

모델 카드에는 영어 단일 여성 화자, 22,050Hz, medium 모델이라고 명시되어 있습니다. 데이터셋의 public domain 표시와 모델 자체의 권리 범위를 동일하게 가정하지 않습니다. [Piper의 모델 라이선스 설명](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md)과 배포 시점의 모델 카드를 확인하세요.

`wordStudy_/scripts/download-model.py`는 모델·설정·모델 카드의 고정 리비전과 SHA-256을 확인합니다. 모델을 교체하면 `TTS_MODEL_REVISION`도 바꾸어 번들 캐시를 갱신하세요.
