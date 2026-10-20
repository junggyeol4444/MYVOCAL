import json
import tempfile
import unittest
from pathlib import Path
import sys
import numpy as np
import soundfile as sf
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from viseme_2d_worker import validate_cues,vowel_shape,mouth_at,render

class TestViseme2D(unittest.TestCase):
    def test_korean_visemes(self):
        self.assertEqual(vowel_shape('가'),'a')
        self.assertEqual(vowel_shape('고'),'o')
        self.assertEqual(vowel_shape('교'),'o')
        self.assertEqual(vowel_shape('구'),'u')
        self.assertEqual(vowel_shape('기'),'i')
        self.assertEqual(vowel_shape('그'),'eu')
    def test_cue_time(self):
        cues=validate_cues({'format':'MYVOCAL_LYRIC_ALIGNMENT','version':1,'cues':[{'startSec':0,'endSec':.8,'lyric':'가'},{'startSec':1,'endSec':1.8,'lyric':'구'}]})
        self.assertEqual(mouth_at(cues,[c[0] for c in cues],.4),'a')
        self.assertEqual(mouth_at(cues,[c[0] for c in cues],.9),'closed')
        self.assertEqual(mouth_at(cues,[c[0] for c in cues],1.4),'u')
    def test_reject_overlap_missing_format(self):
        with self.assertRaises(ValueError):validate_cues({'cues':[]})
        with self.assertRaises(ValueError):validate_cues({'format':'MYVOCAL_LYRIC_ALIGNMENT','version':1,'cues':[{'startSec':1,'endSec':0,'lyric':'가'}]})
    def test_silent_audio_rejected_without_creating_video(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);image=p/'character.png';audio=p/'voice.wav';align=p/'alignment.json';out=p/'new.webm'
            Image.new('RGB',(100,100),(100,120,130)).save(image)
            sf.write(audio,np.zeros(44100,dtype=np.float32),44100,subtype='PCM_16')
            align.write_text(json.dumps({'format':'MYVOCAL_LYRIC_ALIGNMENT','version':1,'cues':[{'startSec':0,'endSec':.8,'lyric':'가'}]}))
            with self.assertRaisesRegex(ValueError,'무음'):
                render(image,audio,align,out)
            self.assertFalse(out.exists())
    def test_real_webm_preserves_originals_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); image=p/'character.png'; audio=p/'voice.wav'; alignment=p/'alignment.json'; output=p/'render.webm'
            Image.new('RGB',(480,720),(110,140,165)).save(image)
            samples=np.sin(2*np.pi*220*np.arange(44100)/44100).astype(np.float32)*.15
            sf.write(audio,samples,44100,subtype='PCM_16')
            alignment.write_text(json.dumps({'format':'MYVOCAL_LYRIC_ALIGNMENT','version':1,'cues':[{'startSec':0,'endSec':.45,'lyric':'가'},{'startSec':.5,'endSec':.95,'lyric':'구'}]}),encoding='utf-8')
            before={k:k.read_bytes() for k in (image,audio,alignment)}
            r=render(image,audio,alignment,output,x=.5,y=.7,mouth_width=.14)
            self.assertEqual(r['frames'],12)
            self.assertGreater(r['size'],1000)
            self.assertEqual(output.read_bytes()[:4],b'\x1aE\xdf\xa3')
            for k,v in before.items():self.assertEqual(k.read_bytes(),v)
            original=output.read_bytes()
            with self.assertRaises(ValueError):render(image,audio,alignment,output)
            self.assertEqual(output.read_bytes(),original)

if __name__=='__main__':unittest.main()
