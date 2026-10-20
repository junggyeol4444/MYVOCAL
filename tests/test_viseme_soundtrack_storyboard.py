"""Verify real mixed soundtrack and non-destructive 2D storyboard camera animation."""
import json
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
import sys
import numpy as np
import soundfile as sf
from PIL import Image, ImageChops, ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from viseme_2d_worker import render,scene_camera

class TestCompletedMusicVideo(unittest.TestCase):
 def test_camera_modes_generate_frames_without_changing_original(self):
  pic=Image.new('RGB',(512,512),(15,30,45))
  from PIL import ImageDraw
  ImageDraw.Draw(pic).rectangle((100,100,300,300),fill=(210,95,65))
  base=pic.tobytes()
  self.assertEqual(scene_camera(pic,1,'static',[0.0],12).tobytes(),base)
  for mode in ('performance','story','mixed'):
   self.assertNotEqual(scene_camera(pic,1,mode,[0.0],12).tobytes(),base)
  self.assertEqual(pic.tobytes(),base)
  with self.assertRaises(ValueError):scene_camera(pic,1,'invalid',[0.0],12)

 def test_music_soundtrack_is_video_audio_and_old_files_preserved(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);image=root/'portrait.png';vocal=root/'vocal.wav';music=root/'music.wav';sync=root/'alignment.json';out=root/'full_mv.webm'
   p=Image.new('RGB',(512,512),(50,20,60));ImageDraw.Draw(p).rectangle((110,100,390,430),fill=(160,90,85));p.save(image)
   rate=44100; t=np.arange(rate*2)/rate
   sf.write(vocal,(np.sin(2*np.pi*220*t)*.10).astype('float32'),rate,subtype='PCM_16')
   sf.write(music,(np.sin(2*np.pi*440*t)*.25).astype('float32'),rate,subtype='PCM_16')
   sync.write_text(json.dumps({'format':'MYVOCAL_LYRIC_ALIGNMENT','version':1,'cues':[{'startSec':0,'endSec':.95,'lyric':'가'},{'startSec':1,'endSec':1.95,'lyric':'구'}]}),encoding='utf-8')
   before={z:z.read_bytes() for z in [image,vocal,music,sync]}
   r=render(image,vocal,sync,out,soundtrack_path=music,scene_mode='story',fps=12,size=512)
   self.assertEqual(r['frames'],24)
   self.assertTrue(out.read_bytes().startswith(b'\x1aE\xdf\xa3'))
   decoded=root/'decoded.wav'
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out),'-vn','-ac','1','-ar','44100',str(decoded)],check=True)
   samples,rate=sf.read(decoded)
   freqs=np.fft.rfftfreq(len(samples),1/rate)
   powers=abs(np.fft.rfft(samples))
   prominent=freqs[powers.argmax()]
   self.assertLess(abs(prominent-440),2.0, f'영상 오디오는 보컬 220Hz가 아니라 완성 음악 440Hz여야 함: {prominent}')
   for path,blob in before.items():self.assertEqual(path.read_bytes(),blob)
   with self.assertRaises(ValueError):render(image,vocal,sync,out,soundtrack_path=music,scene_mode='mixed')
   self.assertTrue(out.read_bytes().startswith(b'\x1aE\xdf\xa3'))
 def test_duration_mismatch_rejects_before_creating_video(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);image=root/'p.png';vocal=root/'v.wav';music=root/'m.wav';sync=root/'a.json';out=root/'o.webm'
   Image.new('RGB',(200,200)).save(image)
   sf.write(vocal,np.sin(2*np.pi*220*np.arange(44100)/44100)*.1,44100,subtype='PCM_16')
   sf.write(music,np.sin(2*np.pi*440*np.arange(66150)/44100)*.1,44100,subtype='PCM_16')
   sync.write_text(json.dumps({'format':'MYVOCAL_LYRIC_ALIGNMENT','version':1,'cues':[{'startSec':0,'endSec':.8,'lyric':'가'}]}))
   with self.assertRaisesRegex(ValueError,'길이'):
    render(image,vocal,sync,out,soundtrack_path=music,scene_mode='mixed')
   self.assertFalse(out.exists())

if __name__=='__main__':unittest.main()
