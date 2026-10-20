"""Basic Pitch subprocess contract tests. Fake inference != real model output."""
import argparse
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import wave

MODULE=Path(__file__).resolve().parents[1]/'desktop'/'stem_midi_worker.py'
spec=importlib.util.spec_from_file_location('myvocal_stem_midi_worker',MODULE)
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class StemMidiWorkerTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.wav=self.root/'stem.wav';self.output=self.root/'transcribed.mid'
        with wave.open(str(self.wav),'wb') as audio:
            audio.setnchannels(2);audio.setsampwidth(2);audio.setframerate(44100)
            audio.writeframes(b'\x01\x00\x02\x00'*44100)
        self.original=self.wav.read_bytes()
        self.calls=[]
        def predict(path,model,**kw):
            self.calls.append((path,kw))
            class Midi:
                instruments=[types.SimpleNamespace(notes=[1,2,3])]
                def write(self,path):
                    Path(path).write_bytes(bytes([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,4,0,255,47,0]))
            return {},Midi(),[(0,.2,60,.9,None)]
        self.model=types.SimpleNamespace(ICASSP_2022_MODEL_PATH=self.wav)
        self.inference=types.SimpleNamespace(Model=lambda path:object(),predict=predict)
    def run_worker(self,more=None):
        with patch.dict(sys.modules,{'basic_pitch':self.model,'basic_pitch.inference':self.inference}):
            worker.execute(['--input',str(self.wav),'--output',str(self.output),*(more or [])])
    def test_neural_model_called_and_midi_written_non_destructively(self):
        self.run_worker()
        self.assertEqual(len(self.calls),1)
        self.assertTrue(self.output.read_bytes().startswith(b'MThd'))
        self.assertEqual(self.wav.read_bytes(),self.original)
    def test_existing_midi_is_never_overwritten(self):
        self.output.write_bytes(b'KEEP')
        with self.assertRaisesRegex(RuntimeError,'덮어쓰기'):
            self.run_worker()
        self.assertEqual(self.output.read_bytes(),b'KEEP')
    def test_bad_threshold_rejected_before_model_load(self):
        with self.assertRaisesRegex(RuntimeError,'임계값'):
            self.run_worker(['--onset','1.1'])
        self.assertFalse(self.output.exists())
    def test_no_notes_does_not_publish_midi(self):
        self.inference.predict=lambda *a,**k: ({},types.SimpleNamespace(instruments=[]),[])
        with self.assertRaisesRegex(RuntimeError,'음표가 없습니다'):
            self.run_worker()
        self.assertFalse(self.output.exists())
    def test_missing_installed_weights_fails_closed(self):
        self.model.ICASSP_2022_MODEL_PATH=self.root/'not-installed'
        with self.assertRaisesRegex(RuntimeError,'가중치'):
            self.run_worker()
        self.assertFalse(self.output.exists())

if __name__=='__main__':unittest.main()
