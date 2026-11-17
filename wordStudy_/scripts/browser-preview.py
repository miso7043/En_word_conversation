import json
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
root=Path(__file__).resolve().parents[2]
lessons=[]
for p in (root/'wordStudy_/seed').glob('*.json'):
    d=json.loads(p.read_text(encoding='utf-8-sig'));d.update(id=p.name,position=0,revision='preview');d.setdefault('date',None);d.setdefault('description',[])
    if isinstance(d['description'],str):d['description']=[d['description']]
    for c in d['conversations']:
        c.setdefault('description',[])
        if isinstance(c['description'],str):c['description']=[c['description']]
    lessons.append(d)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            payload={'lessons':lessons,'auth/session':{'enabled':False,'user':None},'config':{'canImport':False},'audio':{'enabled':False,'jobs':[]}}.get(self.path[5:],{})
            body=json.dumps(payload).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body);return
        self.directory=str(root/'wordStudy_/dist') if not self.path.startswith('/htmlVersion') else str(root)
        if self.path=='/administration':self.path='/index.html'
        super().do_GET()
    def log_message(self,*_):pass
ThreadingHTTPServer(('127.0.0.1',43879),Handler).serve_forever()
