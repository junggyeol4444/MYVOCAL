import importlib.util
import os
import tempfile
import types
import unittest
import wave
from pathlib import Path
spec = importlib.util.spec_from_file_location('musicgen_worker',Path(__file__).resolve().parents[1]/'desktop'/'musicgen_worker.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
class MusicGenOfflineWorkerTests(unittest.TestCase):
 def test_valid_local_model_and_bad_remote_reference(self):
  with tempfile.TemporaryDirectory() as d:
   Path(d,'config.json').write_text('{}')
   args=types.SimpleNamespace(model_dir=d,output=str(Path(d,'out.wav')),seconds=4,prompt='cinematic orchestra',seed=12)
   self.assertEqual(worker.check_arguments(args),Path(d))
   args.model_dir='facebook/musicgen-small'
   with self.assertRaises(ValueError):worker.check_arguments(args)
 def test_real_wav_mono_and_reject_nonfinite(self):
  with tempfile.TemporaryDirectory() as d:
   p=str(Path(d,'a.wav'))
   self.assertGreater(worker.write_pcm_wave(p,[[0.5]*8000],8000),16000)
   with wave.open(p,'rb') as f:
    self.assertEqual(f.getframerate(),8000)
    self.assertEqual(f.getnchannels(),1)
    self.assertEqual(f.getnframes(),8000)
   with self.assertRaises(ValueError):worker.write_pcm_wave(p,[[float('nan')]*8000],8000)
if __name__=='__main__':unittest.main()