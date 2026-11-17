#!/usr/bin/env python3
"""고정 리비전·SHA-256으로 검증한 Piper 모델을 내려받는다. Git에는 포함하지 않는다."""
import hashlib
import sys
import urllib.request
from pathlib import Path
REVISION = 'e9ab671f2a0e50a701b34361136ba3e6a3a9eb0c'
FILES = {
    'en_US-ljspeech-medium.onnx': '6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22',
    'en_US-ljspeech-medium.onnx.json': '141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860',
    'MODEL_CARD': 'fbee1529c89d36b3fe76d7e9f3f832dce17f44900a52d76a9bda735654766b4d',
}
target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'models'
target.mkdir(parents=True, exist_ok=True)
for name, expected in FILES.items():
    path = target / name
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
        print(f'{name}: 기존 파일 검증 완료')
        continue
    partial = target / (name + '.part')
    try:
        urllib.request.urlretrieve(f'https://huggingface.co/rhasspy/piper-voices/resolve/{REVISION}/en/en_US/ljspeech/medium/{name}', partial)
        if hashlib.sha256(partial.read_bytes()).hexdigest() != expected:
            raise ValueError(f'{name}: SHA-256 불일치')
        partial.replace(path)
        print(f'{name}: 다운로드 및 검증 완료')
    finally:
        partial.unlink(missing_ok=True)
