"""실제 파일 형식의 PCM fixture 검사. GPU 모델 테스트와 별개."""
import sys
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'desktop'))
from rvc_inference_audio_quality import verify_rvc_inference_wav


class TestRVCInferenceQuality(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'inference.wav'

    def write(self, sample, frames=3200):
        with wave.open(str(self.path), 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(16000)
            out.writeframes(b''.join(struct.pack('<h', int(sample(i))) for i in range(frames)))
        return self.path

    def test_real_pcm_wave_is_analyzed_without_modification(self):
        path = self.write(lambda i: 16000*math.sin(2*math.pi*220*i/16000))
        before = path.read_bytes()
        result = verify_rvc_inference_wav(path)
        self.assertEqual(result['sample_rate'], 16000)
        self.assertGreater(result['rms'], .1)
        self.assertEqual(path.read_bytes(), before)

    def test_silent_audio_rejected(self):
        with self.assertRaisesRegex(RuntimeError, '무음'):
            verify_rvc_inference_wav(self.write(lambda i: 0))

    def test_direct_current_rejected(self):
        with self.assertRaisesRegex(RuntimeError, '직류'):
            verify_rvc_inference_wav(self.write(lambda i: 4000))

    def test_clipped_pcm_rejected(self):
        with self.assertRaisesRegex(RuntimeError, '클리핑'):
            verify_rvc_inference_wav(self.write(lambda i: 32767 if i%2 else -32768))

    def test_corrupted_wave_rejected(self):
        self.path.write_bytes(b'BROKEN')
        with self.assertRaises(RuntimeError):
            verify_rvc_inference_wav(self.path)


if __name__ == '__main__':
    unittest.main()
