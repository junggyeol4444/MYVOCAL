"""Stdlib-only integration tests: adapter -> child executable -> valid WAV."""
import json
import pathlib
import sys
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import cli_singing_adapter as adapter

HERE=pathlib.Path(__file__).resolve().parent

class CliAdapterTest(unittest.TestCase):
    def setUp(self):
        self.config={
            'name':'TEST - NOT AI', 'mode':'demo', 'timeoutSeconds':5,
            'command':[sys.executable,str(HERE/'sample_worker_NO_AI.py'),'--input','{input}','--output','{output}','--model','{model}'],
            'models':[{'id':'sample-demo','name':'Test','engineId':'demo','languages':['ko']}]
        }
        adapter.CONFIG=adapter.validate_config(self.config)
        self.request={'format':'MYVOCAL_SINGING_REQUEST','version':1,'project':'Test','bpm':100,
            'voice':{'id':'self','name':'Test','rights':'self'},
            'checkpoint':{'id':'sample-demo','name':'Test','engineId':'demo'},
            'cues':[{'lyric':'안','pitch':69,'startSec':0,'endSec':0.20,'velocity':90}]}

    def test_worker_wav(self):
        wav=adapter.invoke_worker(self.request)
        self.assertTrue(wav.startswith(b'RIFF') and wav[8:12]==b'WAVE')
        self.assertGreater(len(wav),1024)

    def test_reject_unregistered_or_unauthorized(self):
        other={**self.request,'checkpoint':{'id':'wrong'}}
        with self.assertRaises(ValueError):adapter.validate_request(other)
        other={**self.request,'voice':{'rights':'reference'}}
        with self.assertRaises(ValueError):adapter.validate_request(other)

    def test_phoneme_hints_forwarded_to_cli_worker(self):
        req={**self.request,'phonemes':[
            {'cueIndex':1,'kind':'nucleus','token':'ㅏ','pitch':69,'startSec':0,'endSec':0.15},
            {'cueIndex':1,'kind':'coda','token':'ㄴ','pitch':69,'startSec':0.15,'endSec':0.2}]}
        self.assertEqual(adapter.validate_request(req),'sample-demo')
        self.assertTrue(adapter.invoke_worker(req).startswith(b'RIFF'))
        req['phonemes'][1]['startSec']=0.01
        with self.assertRaises(ValueError):adapter.validate_request(req)

    def test_http_bridge(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),adapter.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            uri=f'http://127.0.0.1:{server.server_port}'
            with urllib.request.urlopen(uri+'/health',timeout=4) as res:
                info=json.loads(res.read())
                self.assertEqual(info['protocol'],adapter.PROTOCOL)
            with urllib.request.urlopen(uri+'/v1/capabilities',timeout=4) as res:
                info=json.loads(res.read())
                self.assertEqual(info['mode'],'demo')
            req=urllib.request.Request(uri+'/v1/sing',data=json.dumps(self.request).encode('utf-8'),headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=5) as res:
                self.assertEqual(res.headers['Content-Type'],'audio/wav')
                self.assertEqual(res.read(4),b'RIFF')
        finally:
            server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
