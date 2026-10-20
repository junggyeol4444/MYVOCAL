"""Real signal-processing regression; no mock pitch shift or fake WAV."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('score_vocal_worker',ROOT/'desktop/score_vocal_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class ScoreVocalTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.dir=Path(self.tmp.name);self.src=self.dir/'voice.wav';self.score=self.dir/'score.json';self.out=self.dir/'new.wav'
  sr=44100;t=np.arange(sr*2)/sr
  # Actual generated waveform with amplitude envelope (no mock of worker DSP).
  a=np.sin(2*np.pi*220*t)*.3
  a[:int(.02*sr)]*=np.linspace(0,1,int(.02*sr))
  sf.write(self.src,a,sr,subtype='PCM_16')
  self.score.write_text(json.dumps({'notes':[{'startSec':0,'endSec':.8,'pitch':69},{'startSec':.85,'endSec':1.7,'pitch':72}]}),encoding='utf-8')
 def test_real_pcm_notes_shift(self):
  n=worker.render(self.src,self.score,self.out)
  self.assertEqual(n,2)
  samples,sr=sf.read(self.out,dtype='float32',always_2d=True)
  self.assertEqual(sr,44100);self.assertEqual(samples.shape[1],2)
  self.assertGreater(float(np.max(np.abs(samples))),.05)
  f1=worker.estimate_pitch(samples[round(.2*sr):round(.6*sr),0],sr)
  f2=worker.estimate_pitch(samples[round(1.1*sr):round(1.5*sr),0],sr)
  self.assertAlmostEqual(f1,440,delta=25)
  self.assertAlmostEqual(f2,523.25,delta=30)
 def test_real_harmony_shift(self):
  worker.render(self.src,self.score,self.out,interval=7)
  x,sr=sf.read(self.out,dtype='float32',always_2d=True)
  f=worker.estimate_pitch(x[round(.2*sr):round(.6*sr),0],sr)
  self.assertAlmostEqual(f,659.25,delta=40)
 def test_existing_original_never_overwritten(self):
  self.out.write_bytes(b'USER ORIGINAL')
  with self.assertRaisesRegex(ValueError,'덮어쓰기'):
   worker.render(self.src,self.score,self.out)
  self.assertEqual(self.out.read_bytes(),b'USER ORIGINAL')
 def test_empty_audio_rejected(self):
  sf.write(self.src,np.zeros(44100),44100)
  with self.assertRaisesRegex(ValueError,'무음'):
   worker.render(self.src,self.score,self.out)
  self.assertFalse(self.out.exists())
 def test_invalid_notes_rejected(self):
  self.score.write_text(json.dumps({'notes':[{'startSec':0,'endSec':361,'pitch':60}]}))
  with self.assertRaisesRegex(ValueError,'제한'):
   worker.render(self.src,self.score,self.out)
  self.assertFalse(self.out.exists())
 def test_no_voiced_segment(self):
  self.score.write_text(json.dumps({'notes':[{'startSec':2.3,'endSec':2.8,'pitch':60}]}))
  with self.assertRaisesRegex(RuntimeError,'음높이'):
   worker.render(self.src,self.score,self.out)
  self.assertFalse(self.out.exists())

if __name__=='__main__':unittest.main()
