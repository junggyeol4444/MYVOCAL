"""Actual local libFluidSynth/SF2 smoke tests; no fake audio model."""
import importlib.util
from pathlib import Path
import pretty_midi
import struct
import tempfile
import unittest
import wave

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT/'desktop/midi_soundfont_worker.py'
spec = importlib.util.spec_from_file_location('soundfont_worker', MODULE)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

LIB = Path('/lib/x86_64-linux-gnu/libfluidsynth.so.3')
SF = Path('/usr/share/sounds/sf2/TimGM6mb.sf2')

class RenderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.source=self.root/'song.mid'
        self.output=self.root/'out.wav'
        self._midi([(60,0,.3),(64,.35,.7)])
    def _midi(self, notes):
        song=pretty_midi.PrettyMIDI(initial_tempo=110)
        ins=pretty_midi.Instrument(0)
        ins.notes=[pretty_midi.Note(velocity=100,pitch=p,start=s,end=e) for p,s,e in notes]
        song.instruments.append(ins)
        song.write(str(self.source))
    def args(self, **kw):
        from types import SimpleNamespace
        d=dict(input=str(self.source),output=str(self.output),soundfont=str(SF),library=str(LIB),rate=44100,gain=.2)
        d.update(kw)
        return SimpleNamespace(**d)
    @unittest.skipUnless(LIB.exists() and SF.exists(),'libFluidSynth/SF2 not installed')
    def test_real_pcm_soundfont_not_silent(self):
        worker.render(self.args())
        with wave.open(str(self.output),'rb') as f:
            self.assertEqual((f.getnchannels(),f.getsampwidth(),f.getframerate()),(2,2,44100))
            self.assertAlmostEqual(f.getnframes()/f.getframerate(),1.7,delta=.01)
            samples=f.readframes(16000)
            self.assertGreater(max(abs(x) for x in struct.unpack('<%dh'%(len(samples)//2),samples)),40)
    @unittest.skipUnless(LIB.exists() and SF.exists(),'libFluidSynth/SF2 not installed')
    def test_real_drum_one_shot_pcm(self):
        song=pretty_midi.PrettyMIDI(initial_tempo=120)
        drums=pretty_midi.Instrument(0,is_drum=True)
        drums.notes=[pretty_midi.Note(velocity=110,pitch=36,start=0,end=.1)]
        song.instruments.append(drums)
        song.write(str(self.source))
        worker.render(self.args())
        with wave.open(str(self.output),'rb') as f:
            pcm=f.readframes(10000)
            self.assertGreater(max(abs(x) for x in struct.unpack('<%dh'%(len(pcm)//2),pcm)),20)
    @unittest.skipUnless(LIB.exists() and SF.exists(),'libFluidSynth/SF2 not installed')
    def test_real_two_instruments_48000(self):
        song=pretty_midi.PrettyMIDI(initial_tempo=90)
        for pitch,program in [(60,0),(48,32)]:
            ins=pretty_midi.Instrument(program=program)
            ins.notes=[pretty_midi.Note(velocity=100,pitch=pitch,start=0,end=.25)]
            song.instruments.append(ins)
        song.write(str(self.source))
        worker.render(self.args(rate=48000))
        with wave.open(str(self.output),'rb') as f:
            self.assertEqual(f.getframerate(),48000)
            self.assertGreater(f.getnframes(),48000)
    def test_existing_output_is_not_overwritten(self):
        self.output.write_bytes(b'PERSONAL ORIGINAL')
        with self.assertRaisesRegex(ValueError,'덮어쓰기'):
            worker.render(self.args())
        self.assertEqual(self.output.read_bytes(),b'PERSONAL ORIGINAL')
    def test_missing_soundfont_rejected(self):
        with self.assertRaises(OSError):
            worker.render(self.args(soundfont=str(self.root/'not-found.sf2')))
        self.assertFalse(self.output.exists())
    def test_empty_midi_rejected(self):
        self._midi([])
        with self.assertRaisesRegex(ValueError,'악기'):
            worker.render(self.args())
        self.assertFalse(self.output.exists())
    def test_invalid_gain_rejected(self):
        with self.assertRaisesRegex(ValueError,'음량'):
            worker.render(self.args(gain=1.5))
        self.assertFalse(self.output.exists())

if __name__=='__main__':unittest.main()
