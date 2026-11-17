"""선택적 로컬 TTS 서비스. 외부 포트를 공개하지 않는다."""
import hashlib
import json
import os
import subprocess
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MODEL = Path(os.environ.get('PIPER_MODEL', '/models/en_US-ljspeech-medium.onnx'))
CACHE = Path('/cache/sentences')
CACHE.mkdir(parents=True, exist_ok=True)

def render(items, pitch):
    if not MODEL.is_file() or not Path(str(MODEL) + '.json').is_file():
        raise ValueError('Piper 모델과 .onnx.json 설정을 /models에 준비하세요.')
    model_hash = hashlib.sha256(MODEL.read_bytes() + Path(str(MODEL) + '.json').read_bytes()).hexdigest()
    timeline, frames, elapsed, params = [], [], 0.0, None
    for item in items:
        text = item['text']
        key = hashlib.sha256(json.dumps([text, pitch, model_hash, 'piper-1.3.0', bool(item.get('userTurn'))], ensure_ascii=False).encode()).hexdigest()
        output = CACHE / (key + '.wav')
        if not output.exists():
            with tempfile.TemporaryDirectory(dir=CACHE) as tmp:
                raw, adjusted = Path(tmp) / 'raw.wav', Path(tmp) / 'adjusted.wav'
                if item.get('userTurn'):
                    with wave.open(str(raw), 'wb') as silence:
                        silence.setnchannels(1)
                        silence.setsampwidth(2)
                        silence.setframerate(22050)
                        silence.writeframes(bytes(22050 * 2))
                else:
                    subprocess.run(['python', '-m', 'piper', '--model', str(MODEL), '--output_file', str(raw)], input=text.encode(), check=True, timeout=120, stdout=subprocess.DEVNULL)
                with wave.open(str(raw)) as source:
                    rate = source.getframerate()
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', f'asetrate={rate}*{pitch},aresample={rate},atempo={1/pitch}', '-ac', '1', '-c:a', 'pcm_s16le', str(adjusted)], check=True, timeout=120)
                adjusted.replace(output)
        with wave.open(str(output)) as source:
            if params is None:
                params = source.getparams()
            data = source.readframes(source.getnframes())
            duration = source.getnframes() / source.getframerate()
            timeline.append({**item, 'start': elapsed, 'end': elapsed + duration})
            frames.append(data)
            elapsed += duration
    with tempfile.TemporaryDirectory(dir=CACHE) as tmp:
        target = Path(tmp) / 'bundle.wav'
        with wave.open(str(target), 'wb') as dest:
            dest.setparams(params)
            for data in frames:
                dest.writeframes(data)
        return target.read_bytes(), timeline

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if self.path != '/render' or not 0 < size <= 4 * 1024 * 1024:
                raise ValueError('잘못된 요청')
            payload = json.loads(self.rfile.read(size))
            items = payload['items']
            pitch = float(payload.get('pitch', 1))
            if not .5 <= pitch <= 1.5 or not isinstance(items, list) or not 0 < len(items) <= 2000 or any(not isinstance(x.get('text'), str) or len(x['text']) > 10000 for x in items) or sum(len(x['text']) for x in items) > 100000:
                raise ValueError('음성 생성 범위를 확인하세요.')
            audio, timeline = render(items, pitch)
            import base64
            body = json.dumps({'audio': base64.b64encode(audio).decode(), 'timeline': timeline}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            body = json.dumps({'message': str(error)}).encode()
            self.send_response(500)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
