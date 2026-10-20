"""RVC official pipeline orchestration tests. Mocked subprocess != GPU inference."""
import argparse
import importlib.util
import json
import wave
from pathlib import Path
import tempfile
import types
import sys
import unittest
from unittest.mock import patch

WORKER = Path(__file__).resolve().parents[1] / 'desktop' / 'rvc_official_worker.py'
spec = importlib.util.spec_from_file_location('myvocal_rvc_official_worker', WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class OfficialRVCWorkerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'installed-RVC'
        self.dataset = Path(self.temp.name) / 'job-dataset'
        self.output = Path(self.temp.name) / 'job-result' / 'trained-model.pth'
        for name in worker.REQUIRED:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({'model': {'spk_embed_dim': 1}}) if name.endswith('48k.json') else 'installed-by-user')
        audio = self.dataset / 'audio' / 'sample-001.wav'
        audio.parent.mkdir(parents=True)
        audio.write_bytes(b'PRIVATE_USER_VOICE_DATA')
        self.audio = audio
        self.args = argparse.Namespace(root=str(self.root), dataset=str(self.dataset),
                                       output=str(self.output), epochs=20, batch_size=2,
                                       gpu=0, experiment_name='', no_index=False)
        self.torch = types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: True, device_count=lambda: 1))
        self.old = self.root / 'assets' / 'weights' / 'old-model.pth'
        self.old.parent.mkdir(parents=True, exist_ok=True)
        self.old.write_bytes(b'KEEP_ME')

    def fake_stage(self, cmd, cwd, check):
        self.assertTrue(check)
        self.assertEqual(cwd, str(self.root))
        stage = cmd[1].replace('\\', '/')
        if stage.endswith('preprocess.py'):
            exp = Path(cmd[5])
            (exp / '0_gt_wavs').mkdir(parents=True)
            (exp / '0_gt_wavs' / 'sample-001.wav').write_bytes(b'WAV')
        elif stage.endswith('extract_f0.py'):
            exp = Path(cmd[6])
            for folder in ('2a_f0', '2b-f0nsf'):
                (exp / folder).mkdir(parents=True)
                (exp / folder / 'sample-001.wav.npy').write_bytes(b'NUMPY')
        elif stage.endswith('extract_hubert_feature.py'):
            exp = Path(cmd[6])
            (exp / '3_feature768').mkdir(parents=True)
            (exp / '3_feature768' / 'sample-001.npy').write_bytes(b'NUMPY')
        elif stage.endswith('train_index.py'):
            name = cmd[2]
            exp = self.root / 'logs' / name
            (exp / ('added_IVF1_Flat_nprobe_1_' + name + '_v2.index')).write_bytes(b'INDEX' * 500)
        elif stage.endswith('cli.py'):
            self.assertEqual(cmd[cmd.index('--index-rate') + 1], '0.5')
            self.assertTrue(Path(cmd[cmd.index('--index')+1]).is_file())
            self.assertEqual(cmd[cmd.index('--f0-method') + 1], 'pm')
            target = Path(cmd[cmd.index('--output') + 1])
            with wave.open(str(target), 'wb') as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(16000)
                audio.writeframes(b'\x01\x00' * 2000)
        elif stage.endswith('train.py'):
            name = cmd[cmd.index('-e') + 1]
            exp = self.root / 'logs' / name
            self.assertIn('sample-001', (exp / 'filelist.txt').read_text())
            self.assertEqual(json.loads((exp / 'config.json').read_text())['model']['spk_embed_dim'], 1)
            (self.root / 'assets' / 'weights' / (name + '.pth')).write_bytes(b'P' * 2048)
        else:
            self.fail('unexpected stage ' + stage)

    def execute(self, runner=None):
        with patch.dict(sys.modules, {'torch': self.torch}), patch.object(worker.subprocess, 'run', side_effect=runner or self.fake_stage):
            worker.execute(self.args)

    def test_five_real_stage_commands_and_originals_untouched(self):
        calls = []
        def run(cmd, cwd, check):
            calls.append(cmd[1]); self.fake_stage(cmd, cwd, check)
        self.execute(run)
        self.assertEqual(len(calls), 6)
        self.assertEqual(self.output.read_bytes(), b'P' * 2048)
        self.assertTrue(self.output.with_suffix('.index').read_bytes().startswith(b'INDEX'))
        self.assertEqual(self.audio.read_bytes(), b'PRIVATE_USER_VOICE_DATA')
        self.assertEqual(self.old.read_bytes(), b'KEEP_ME')
        self.assertEqual(list((self.root / 'logs').glob('myvocal_*')), [])

    def test_failed_inference_does_not_publish_unverified_checkpoint(self):
        def bad_inference(cmd, cwd, check):
            if cmd[1].endswith('cli.py'):
                Path(cmd[cmd.index('--output') + 1]).write_bytes(b'NOT_A_WAV')
                return
            self.fake_stage(cmd, cwd, check)
        with self.assertRaises((wave.Error, RuntimeError)):
            self.execute(bad_inference)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.output.with_suffix('.index').exists())
        self.assertEqual(self.audio.read_bytes(), b'PRIVATE_USER_VOICE_DATA')
        self.assertEqual(self.old.read_bytes(), b'KEEP_ME')

    def test_missing_inference_cli_rejected_before_training(self):
        (self.root / 'infer/cli.py').unlink()
        with self.assertRaisesRegex(RuntimeError, 'cli.py'):
            self.execute()
        self.assertFalse(self.output.exists())

    def test_existing_output_not_overwritten(self):
        self.output.parent.mkdir(parents=True)
        self.output.write_bytes(b'KEEP_OLD')
        with self.assertRaisesRegex(RuntimeError, '덮어쓸'):
            self.execute()
        self.assertEqual(self.output.read_bytes(), b'KEEP_OLD')

    def test_missing_official_pretrained_file_fails_before_launch(self):
        (self.root / 'assets/pretrained_v2/f0G48k.pth').unlink()
        with self.assertRaisesRegex(RuntimeError, 'f0G48k'):
            self.execute()
        self.assertFalse(self.output.exists())

    def test_invalid_gpu_rejected_before_launch(self):
        self.args.gpu = 4
        with self.assertRaisesRegex(RuntimeError, 'CUDA'):
            self.execute()
        self.assertFalse(self.output.exists())

    def test_incomplete_f0_does_not_train_or_leak_temp_audio(self):
        def missing_f0(cmd, cwd, check):
            if cmd[1].endswith('extract_f0.py'):
                return
            self.fake_stage(cmd, cwd, check)
        with self.assertRaisesRegex(RuntimeError, '결과 폴더'):
            self.execute(missing_f0)
        self.assertFalse(self.output.exists())
        self.assertEqual(list((self.root / 'logs').glob('myvocal_*')), [])

    def test_invalid_experiment_name_rejected_before_launch(self):
        self.args.experiment_name = '../existing-user-experiment'
        with self.assertRaisesRegex(RuntimeError, 'ID'):
            self.execute()
        self.assertFalse((self.root / 'logs').exists())

    def test_explicit_experiment_name_and_marker_cleanup(self):
        self.args.experiment_name = 'myvocal_' + 'a' * 32
        self.execute()
        self.assertTrue(self.output.is_file())
        self.assertFalse((self.root / 'logs' / self.args.experiment_name).exists())

    def test_marker_mismatch_preserves_unknown_directory(self):
        exp = self.root / 'logs' / ('myvocal_' + 'b' * 32)
        exp.mkdir(parents=True)
        (exp / '.myvocal-experiment').write_text('other-user')
        (exp / 'original.txt').write_text('DO_NOT_DELETE')
        worker.safe_remove_experiment(exp, exp.name)
        self.assertEqual((exp / 'original.txt').read_text(), 'DO_NOT_DELETE')

    def test_no_index_explicit_mode_uses_no_retrieval(self):
        self.args.no_index = True
        calls=[]
        def run(cmd,cwd,check):
            calls.append(cmd[1])
            if cmd[1].endswith('cli.py'):
                self.assertEqual(cmd[cmd.index('--index-rate')+1], '0')
                self.assertNotIn('--index',cmd)
                target=Path(cmd[cmd.index('--output')+1])
                with wave.open(str(target),'wb') as wav:
                    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\x01\x00'*2000)
            else:self.fake_stage(cmd,cwd,check)
        self.execute(run)
        self.assertEqual(len(calls),5)
        self.assertFalse(self.output.with_suffix('.index').exists())

    def test_index_failure_preserves_original_and_does_not_publish(self):
        def fail_index(cmd,cwd,check):
            if cmd[1].endswith('train_index.py'):
                return
            self.fake_stage(cmd,cwd,check)
        with self.assertRaisesRegex(RuntimeError,'인덱스'):
            self.execute(fail_index)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.output.with_suffix('.index').exists())
        self.assertEqual(self.old.read_bytes(),b'KEEP_ME')

    def test_original_audio_inside_rvc_install_is_not_used(self):
        self.args.dataset = str(self.root / 'my-own-original-recordings')
        audio = Path(self.args.dataset) / 'audio'
        audio.mkdir(parents=True)
        (audio / 'sample-001.wav').write_bytes(b'PRIVATE')
        with self.assertRaisesRegex(RuntimeError, '원본 음성'):
            self.execute()


if __name__ == '__main__':
    unittest.main()
