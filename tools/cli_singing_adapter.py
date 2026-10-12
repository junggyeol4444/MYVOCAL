#!/usr/bin/env python3
"""MYVOCAL v1.2 CLI-to-HTTP adapter for an independently installed singing engine.

The adapter itself performs NO neural inference, NO training and NO voice cloning.
It invokes an EXPLICIT user-configured command (without a shell) that must take a
MYVOCAL cue JSON file and write a valid PCM WAV.  See config.example.json.
"""
import argparse
import json
import os
import pathlib
import subprocess
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Semaphore

PROTOCOL = 'MYVOCAL_SINGING_V1'
MAX_REQUEST = 48 * 1024
MAX_WAV = 32 * 1024 * 1024
CONFIG = {}
LOCK = Semaphore(1)


def validate_config(config):
    command = config.get('command')
    if not isinstance(command, list) or not 1 <= len(command) <= 25:
        raise ValueError('config.command must be a JSON list with 1 to 25 arguments')
    if not all(isinstance(s, str) and 0 < len(s) <= 2048 for s in command):
        raise ValueError('all command parts must be strings')
    if not os.path.isabs(command[0]) or not os.path.isfile(command[0]):
        raise ValueError('command[0] must be an absolute path to an installed executable')
    if not any('{input}' in s for s in command) or not any('{output}' in s for s in command):
        raise ValueError('command must contain {input} and {output} placeholders')
    if config.get('mode', 'unknown') not in ('neural', 'demo', 'sample', 'unknown'):
        raise ValueError('mode must be neural, demo, sample, or unknown')
    models = config.get('models', [])
    if not isinstance(models, list) or len(models) > 48:
        raise ValueError('models must be a list of <= 48 entries')
    for model in models:
        if not isinstance(model, dict) or not isinstance(model.get('id'), str) or not model['id']:
            raise ValueError('each model requires a string id')
    timeout = config.get('timeoutSeconds', 90)
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= 105:
        raise ValueError('timeoutSeconds must be between 1 and 105')
    return config


def validate_request(req):
    if req.get('format') != 'MYVOCAL_SINGING_REQUEST' or req.get('version') != 1:
        raise ValueError('incompatible MYVOCAL singing protocol')
    if req.get('voice', {}).get('rights') not in ('self', 'owned', 'licensed'):
        raise ValueError('voice permission not verified')
    cues = req.get('cues')
    if not isinstance(cues, list) or not 1 <= len(cues) <= 128:
        raise ValueError('expected 1-128 MIDI/lyric cues')
    for c in cues:
        if not isinstance(c, dict) or not 36 <= c.get('pitch', -1) <= 96 or not 0 <= c.get('startSec', -1) < c.get('endSec', -1) <= 90:
            raise ValueError('invalid cue timing or pitch')
    phonemes = req.get('phonemes', [])
    if not isinstance(phonemes, list) or len(phonemes) > 512:
        raise ValueError('phoneme hints must contain at most 512 segments')
    last_end = {}
    for seg in phonemes:
        if not isinstance(seg, dict) or type(seg.get('cueIndex')) is not int or not 1 <= seg['cueIndex'] <= len(cues):
            raise ValueError('invalid phoneme cue index')
        cue = cues[seg['cueIndex'] - 1]
        if not isinstance(seg.get('token'), str) or not 1 <= len(seg['token']) <= 40 or seg.get('kind') not in ('onset','nucleus','coda','text'):
            raise ValueError('invalid phoneme token or kind')
        start, end = seg.get('startSec'), seg.get('endSec')
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or not cue['startSec'] - .001 <= start < end <= cue['endSec'] + .001:
            raise ValueError('invalid phoneme time span')
        if seg.get('pitch') != cue['pitch'] or start < last_end.get(seg['cueIndex'], 0) - .00011:
            raise ValueError('overlapping phoneme segments or wrong pitch')
        last_end[seg['cueIndex']] = end
    configured = CONFIG.get('models', [])
    requested = (req.get('checkpoint') or {}).get('id')
    if configured and requested not in {m['id'] for m in configured}:
        raise ValueError('selected model id not registered in this adapter')
    return requested or ''


def invoke_worker(req):
    model_id = validate_request(req)
    with tempfile.TemporaryDirectory(prefix='myvocal-sing-') as temp:
        request_file = pathlib.Path(temp) / 'request.json'
        wav_file = pathlib.Path(temp) / 'result.wav'
        request_file.write_text(json.dumps(req, ensure_ascii=False), encoding='utf-8')
        substitutions = {'{input}': str(request_file), '{output}': str(wav_file), '{model}': model_id}
        command = []
        for part in CONFIG['command']:
            for key, value in substitutions.items():
                part = part.replace(key, value)
            command.append(part)
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                shell=False, timeout=CONFIG.get('timeoutSeconds', 90),
                                cwd=CONFIG.get('workdir') or None, check=False)
        if result.returncode != 0:
            tail = (result.stderr or result.stdout).decode('utf-8', 'replace')[-400:]
            raise ValueError(f'외부 추론 명령 종료 코드 {result.returncode}: {tail}')
        if not wav_file.exists() or wav_file.stat().st_size > MAX_WAV:
            raise ValueError('외부 엔진이 WAV를 생성하지 않았거나 32MB를 초과했습니다')
        data = wav_file.read_bytes()
        try:
            with wave.open(str(wav_file), 'rb') as wav:
                if wav.getnchannels() not in (1, 2) or wav.getframerate() < 8000 or wav.getframerate() > 96000 or wav.getsampwidth() not in (1, 2, 3, 4) or wav.getnframes() < 1:
                    raise ValueError('WAV PCM 규격을 확인하세요')
        except (wave.Error, EOFError) as exc:
            raise ValueError('WAV PCM 헤더가 올바르지 않습니다') from exc
        return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self, pattern, *args):
        print('%s %s' % (self.address_string(), pattern % args), flush=True)

    def send_bytes(self, data, mime='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, obj, status=200):
        self.send_bytes(json.dumps(obj, ensure_ascii=False).encode('utf-8'), status=status)

    def do_GET(self):
        if self.path == '/health':
            self.send_json({'status': 'ok', 'protocol': PROTOCOL, 'name': CONFIG.get('name', 'User CLI singing adapter')})
        elif self.path == '/v1/capabilities':
            self.send_json({'protocol': PROTOCOL, 'name': CONFIG.get('name', 'User CLI singing adapter'),
                            'mode': CONFIG.get('mode', 'unknown'), 'inferenceReady': True,
                            'models': CONFIG.get('models', []), 'supportedLanguages': CONFIG.get('languages', ['ko']),
                            'features': ['wav', 'cli-bridge']})
        else:
            self.send_json({'error': 'not found'}, status=404)

    def do_POST(self):
        if self.path != '/v1/sing':
            return self.send_json({'error': 'not found'}, status=404)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_REQUEST:
                raise ValueError('request too large')
            req = json.loads(self.rfile.read(size))
            if not LOCK.acquire(blocking=False):
                return self.send_json({'error': 'engine busy'}, status=503)
            try:
                data = invoke_worker(req)
            finally:
                LOCK.release()
            self.send_bytes(data, 'audio/wav')
        except (ValueError, OSError, subprocess.TimeoutExpired, KeyError, TypeError) as exc:
            self.send_json({'error': str(exc)[:500]}, status=400)


def main():
    parser = argparse.ArgumentParser(description='MYVOCAL local CLI engine adapter (no AI model included)')
    parser.add_argument('--port', type=int, default=7867)
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or args.port == 58319:
        parser.error('port must be 1024..65535 except 58319')
    global CONFIG
    with open(args.config, encoding='utf-8') as handle:
        CONFIG = validate_config(json.load(handle))
    print(f'MYVOCAL CLI adapter listening on 127.0.0.1:{args.port}; mode={CONFIG.get("mode", "unknown")}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
