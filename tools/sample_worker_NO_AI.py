#!/usr/bin/env python3
"""Smoke-test worker: synth tone from MIDI. This is NOT AI or a voice model."""
import argparse
import json
import pathlib
from demo_singing_engine import synth

p=argparse.ArgumentParser()
p.add_argument('--input',required=True)
p.add_argument('--output',required=True)
p.add_argument('--model',default='')
a=p.parse_args()
request=json.loads(pathlib.Path(a.input).read_text(encoding='utf-8'))
pathlib.Path(a.output).write_bytes(synth(request))
