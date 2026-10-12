#!/usr/bin/env python3
"""MYVOCAL Singing Bridge v1 test engine (NO AI, NO voice cloning).
This optional demo produces a synthetic vowel-like tone from each MIDI note.
Run: python tools/demo_singing_engine.py --port 7867
"""
import argparse
import io
import json
import math
import struct
import wave
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

RATE = 22050
MAX_BODY = 64 * 1024


def synth(payload):
    cues = payload.get('cues', [])
    if not isinstance(cues, list) or not 1 <= len(cues) <= 128:
        raise ValueError('1-128 cues required')
    end = max(float(c['endSec']) for c in cues)
    if not 0 < end <= 90:
        raise ValueError('length out of range')
    out = [0.0] * (int((end + 0.15) * RATE) + 1)
    for cue in cues:
        start, stop = float(cue['startSec']), float(cue['endSec'])
        pitch = int(cue['pitch'])
        if not 36 <= pitch <= 96 or not 0 <= start < stop <= 90:
            raise ValueError('invalid cue')
        if str(cue.get('lyric', '')) in ('', '—'):
            continue
        hz = 440 * (2 ** ((pitch-69)/12))
        start_frame = int(start * RATE)
        count = int((stop-start)*RATE)
        for k in range(count):
            t = k/RATE
            attack = min(1.0, t/0.027)
            release = min(1.0, (count-k)/max(1, int(.075*RATE)))
            env = max(0, min(attack, release))
            harmonic = (math.sin(2*math.pi*hz*t)*.64 + math.sin(4*math.pi*hz*t)*.24 + math.sin(6*math.pi*hz*t)*.09)
            out[start_frame+k] += env*harmonic*.35
    f = io.BytesIO()
    with wave.open(f,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(RATE)
        pcm = b''.join(struct.pack('<h',max(-32768,min(32767,round(v*32767)))) for v in out)
        wav.writeframes(pcm)
    return f.getvalue()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            data={'status':'ok','protocol':'MYVOCAL_SINGING_V1','name':'MYVOCAL Test Tone (NO AI)'}
        elif self.path == '/v1/capabilities':
            data={'protocol':'MYVOCAL_SINGING_V1','name':'MYVOCAL Test Tone (NO AI)','mode':'demo','inferenceReady':False,'models':[],'supportedLanguages':['ko'],'features':['wav']}
        else:
            self.send_error(404);return
        self._send(json.dumps(data,ensure_ascii=False).encode(),'application/json')
    def do_POST(self):
        if self.path != '/v1/sing':
            self.send_error(404);return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0 < length <= MAX_BODY:
                raise ValueError('payload too large')
            req=json.loads(self.rfile.read(length))
            if req.get('format')!='MYVOCAL_SINGING_REQUEST' or req.get('version')!=1:
                raise ValueError('invalid protocol')
            self._send(synth(req),'audio/wav')
        except (ValueError,KeyError,TypeError,OverflowError) as exc:
            self._send(json.dumps({'error':str(exc)}).encode(),'application/json',400)
    def _send(self,data,typ,code=200):
        self.send_response(code);self.send_header('Content-Type',typ)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)

if __name__ == '__main__':
    a=argparse.ArgumentParser();a.add_argument('--port',type=int,default=7867)
    args=a.parse_args()
    if not 1024 <= args.port <= 65535 or args.port == 58319:
        a.error('Choose port 1024-65535 other than 58319')
    print(f'NO-AI DEMO singing server: http://127.0.0.1:{args.port}')
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
