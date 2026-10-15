#!/usr/bin/env python3
"""Restore the unchanged historical and current Windows EXEs from Git artifacts.

Requires zstd CLI. Verifies each part, whole compressed archive, and each EXE hash.
Does not overwrite existing files of different content.
"""
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'artifacts' / 'windows-history' / 'sha256-manifest.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_save(path, data, expected):
    if sha(data) != expected:
        raise RuntimeError(f'hash mismatch: {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and sha(path.read_bytes()) != expected:
        raise RuntimeError(f'refusing to overwrite different existing file: {path}')
    path.write_bytes(data)


def main():
    if not shutil.which('zstd'):
        raise SystemExit('zstd command not found. Install zstd locally and rerun (source tests do not need this step).')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    exes = manifest['original_executables']
    for arc in manifest['archives']:
        packed = bytearray()
        for part in arc['parts']:
            p = ROOT / part['path']
            data = p.read_bytes()
            if len(data) != part['size'] or sha(data) != part['sha256']:
                raise RuntimeError(f'corrupt archive part: {p}')
            packed.extend(data)
        if len(packed) != arc['size'] or sha(packed) != arc['sha256']:
            raise RuntimeError(f'corrupt compressed archive: {arc["name"]}')
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / arc['name']
            archive.write_bytes(packed)
            if arc['label'] == 'latest':
                d = subprocess.check_output(['zstd', '-q', '-d', '-c', str(archive)])
                name = 'MYVOCAL-Step100-Windows.exe'
                safe_save(ROOT / name, d, exes[name]['sha256'])
                print('restored', name)
            else:
                proc = subprocess.Popen(['zstd', '-q', '-d', '-c', str(archive)], stdout=subprocess.PIPE)
                names = set()
                with tarfile.open(fileobj=proc.stdout, mode='r|') as tar:
                    for entry in tar:
                        if not entry.isfile() or entry.name not in exes or '/' in entry.name or '\\' in entry.name:
                            raise RuntimeError('unsafe or unknown archive entry: ' + entry.name)
                        names.add(entry.name)
                        safe_save(ROOT / entry.name, tar.extractfile(entry).read(), exes[entry.name]['sha256'])
                if proc.wait() != 0 or len(names) != 56:
                    raise RuntimeError('incomplete historical executable restore')
                print('restored', len(names), 'historical executables')
    print('All Windows EXE hashes verified')


if __name__ == '__main__':
    main()
