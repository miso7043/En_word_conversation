"""실제 Piper 모델이 준비된 선택적 컨테이너에서 실행한다."""
import importlib.util
import io
import os
import wave
from pathlib import Path
path = Path(os.environ['TTS_SERVICE_PATH']) if 'TTS_SERVICE_PATH' in os.environ else Path(__file__).resolve().parents[1] / 'tts/service.py'
spec = importlib.util.spec_from_file_location('tts_service', path)
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)
items = [{'lessonId':'test','position':0,'speaker':'A','text':'Hello. Welcome to English practice.'},
         {'lessonId':'test','position':1,'speaker':'B','text':'Let us practice together.'}]
audio, timeline = service.render(items, 1)
with wave.open(io.BytesIO(audio)) as source:
    assert source.getnframes() > 1000
    assert source.getframerate() == 22050
    assert source.getnchannels() == 1
assert timeline[0]['end'] == timeline[1]['start']
before = {p.name:p.stat().st_mtime_ns for p in service.CACHE.glob('*.wav')}
again, _ = service.render(items, 1)
assert audio == again
assert before == {p.name:p.stat().st_mtime_ns for p in service.CACHE.glob('*.wav')}
changed = [items[0], {**items[1], 'text':'This sentence changed.'}]
service.render(changed, 1)
assert len(list(service.CACHE.glob('*.wav'))) == len(before) + 1
service.render(items, 1.2)
silent, _ = service.render([{**items[0], 'userTurn':True}], 1)
with wave.open(io.BytesIO(silent)) as source:
    assert set(source.readframes(source.getnframes())) == {0}
print('PASS: 실제 Piper 음성·22,050Hz WAV·문장 시간표·캐시 재사용·변경 문장만 생성·피치 변환·롤플레이 무음')
