#!/usr/bin/env python3
"""Git에서 추적하는 학습 자료만 정적 목록에 포함한다."""
import json
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
names = subprocess.check_output(['git', 'ls-files', '-z', 'htmlVersion/json/*.json'], cwd=root).decode().split('\0')
(root / 'htmlVersion/lessons.json').write_text(json.dumps(sorted(Path(name).name for name in names if name), ensure_ascii=False, indent=2) + '\n')
