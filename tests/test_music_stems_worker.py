import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'desktop'))
import music_stems_worker as worker


def write_wav(path, frames=4410):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b'\x00\x00\x01\x00' * frames)


class TestMusicStemsWorker(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'weights'
        self.repo.mkdir()
        (self.repo / 'weights.th').write_bytes(b'local')
        (self.repo / 'htdemucs.yaml').write_text('models:\n  - weights\n', encoding='utf-8')
        self.input = self.root / 'source.wav'
        write_wav(self.input)
        self.out = self.root / 'out'
        self.out.mkdir()

    def args(self, *more):
        return ['--repo', str(self.repo), '--model', 'htdemucs', '--input', str(self.input), '--out', str(self.out), *more]

    def fake_run(self, command, **kwargs):
        self.assertIn('--repo', command)
        self.assertIn(str(self.repo), command)
        self.assertIn('demucs.separate', command)
        self.assertEqual(kwargs['env']['HF_HUB_OFFLINE'], '1')
        base = self.out / 'htdemucs'
        base.mkdir()
        for stem in worker.STEMS:
            write_wav(base / (stem + '.wav'))

    def test_actual_demucs_cli_contract_is_invoked(self):
        with patch.object(worker.subprocess, 'run', side_effect=self.fake_run) as call:
            worker.execute(self.args())
        self.assertEqual(call.call_count, 1)

    def test_missing_local_weights_fails_closed(self):
        (self.repo / 'weights.th').unlink()
        with patch.object(worker.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, '가중치'):
                worker.execute(self.args())
            run.assert_not_called()

    def test_incomplete_output_is_rejected(self):
        def partial(command, **kwargs):
            base = self.out / 'htdemucs'
            base.mkdir()
            write_wav(base / 'drums.wav')
        with patch.object(worker.subprocess, 'run', side_effect=partial):
            with self.assertRaisesRegex(RuntimeError, 'bass.wav'):
                worker.execute(self.args())

    def test_frame_mismatch_is_rejected(self):
        def mismatch(command, **kwargs):
            base = self.out / 'htdemucs'
            base.mkdir()
            for stem in worker.STEMS:
                write_wav(base / (stem + '.wav'), 4410 if stem != 'vocals' else 4411)
        with patch.object(worker.subprocess, 'run', side_effect=mismatch):
            with self.assertRaisesRegex(RuntimeError, '길이'):
                worker.execute(self.args())

    def test_named_model_must_exist_in_local_repo(self):
        (self.repo / 'htdemucs.yaml').unlink()
        with patch.object(worker.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, '모델 이름'):
                worker.execute(self.args())
            run.assert_not_called()

    def test_yaml_must_reference_real_weights(self):
        (self.repo / 'htdemucs.yaml').write_text('models:\n  - missing\n', encoding='utf-8')
        with patch.object(worker.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, '참조'):
                worker.execute(self.args())
            run.assert_not_called()

    def test_model_output_must_match_input_duration(self):
        def too_short(command, **kwargs):
            base = self.out / 'htdemucs'
            base.mkdir()
            for name in worker.STEMS:
                write_wav(base / (name + '.wav'), 13230)
        with patch.object(worker.subprocess, 'run', side_effect=too_short):
            with self.assertRaisesRegex(RuntimeError, '0.1초'):
                worker.execute(self.args())

    def test_real_six_stem_model_is_accepted_without_dropping_instruments(self):
        def six_stems(command, **kwargs):
            self.fake_run(command, **kwargs)
            for name in worker.EXTRA_STEMS:
                write_wav(self.out / 'htdemucs' / (name + '.wav'))
        with patch.object(worker.subprocess, 'run', side_effect=six_stems):
            worker.execute(self.args())

    def test_incomplete_six_stem_output_is_rejected(self):
        def five_stems(command, **kwargs):
            self.fake_run(command, **kwargs)
            write_wav(self.out / 'htdemucs' / 'guitar.wav')
        with patch.object(worker.subprocess, 'run', side_effect=five_stems):
            with self.assertRaisesRegex(RuntimeError, '4개 또는 6개'):
                worker.execute(self.args())

    def test_input_over_six_minutes_rejected_before_inference(self):
        import struct
        frames = 44100 * 360 + 1
        with self.input.open('wb') as f:
            f.write(b'RIFF' + struct.pack('<I', 36 + frames * 4) + b'WAVE')
            f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 2, 44100, 176400, 4, 16))
            f.write(b'data' + struct.pack('<I', frames * 4))
            f.truncate(44 + frames * 4)  # Sparse file; does not allocate 64MB RAM.
        with patch.object(worker.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, '360초'):
                worker.execute(self.args())
            run.assert_not_called()

    def test_device_cpu_argument_is_forwarded(self):
        with patch.object(worker.subprocess, 'run', side_effect=self.fake_run) as call:
            worker.execute(self.args('--device', 'cpu'))
        self.assertIn('cpu', call.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
