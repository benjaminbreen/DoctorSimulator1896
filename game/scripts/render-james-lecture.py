"""Render the Dane Hall performance. Requires kokoro-onnx 0.6.1, soundfile and ffmpeg.

Pass the paths to kokoro-v1.0.int8.onnx and voices-v1.0.bin from the
kokoro-onnx model-files-v1.0 release. No voice model is shipped to players.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

game = Path(__file__).resolve().parents[1]
script = game / 'src/content/jamesLecture.json'
destination = game / 'public/audio/dane-hall'


def encode(source, out, *filters):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(source), *filters,
                    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', str(out)], check=True)


def assemble(parts, waves, work):
    total = sum(sf.info(path).frames for group in waves for path in group)
    position = 0
    joined = work / 'lecture.wav'
    with sf.SoundFile(joined, 'w', samplerate=24000, channels=1) as out:
        for part, group in zip(parts, waves, strict=True):
            part['starts'] = []
            for path in group:
                samples, rate = sf.read(path)
                if rate != 24000:
                    raise ValueError('Expected 24 kHz mono voice')
                part['starts'].append(round(3600 * position / total, 3))
                out.write(samples)
                position += len(samples)
    tempo = total / (24000 * 3600)
    encode(joined, destination / 'lecture.m4a', '-af', f'atempo={tempo:.10f},apad,atrim=duration=3600')
    # Store one byte per 50 ms for the face rig, sampled from the final recording.
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(destination / 'lecture.m4a'),
                                   '-f', 's16le', '-ar', '8000', '-ac', '1', '-'])
    samples = np.frombuffer(pcm, dtype='<i2')[:3600*8000].astype(np.float32) / 32768
    rms = np.sqrt(np.mean(samples.reshape(-1, 400)**2, axis=1))
    (destination / 'articulation.bin').write_bytes(np.uint8(np.clip(rms*1150-3, 0, 255)).tobytes())
    script.write_text(json.dumps(parts, ensure_ascii=False, indent=2) + '\n')


def render(model, voices, work):
    parts = json.loads(script.read_text())
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model), options, providers=['CPUExecutionProvider'])
    engine = Kokoro.from_session(session, str(voices))
    groups = []
    for part in parts:
        group = []
        for line in part['lines']:
            name = hashlib.sha256(line.encode()).hexdigest()[:24]
            path = work / (name + '.wav')
            if not path.exists():
                speech = line.replace('O, the object', 'Oh, the object').replace('fiat', 'fee-at').replace('ideo-motor', 'id ee oh motor')
                wav, rate = engine.create(speech, 'am_michael', speed=.98)
                pause = .42 if re.search('[.?!][”’]?$', line) else .1
                sf.write(path, np.concatenate([wav, np.zeros(round(rate * pause))]), rate)
            group.append(path)
        groups.append(group)
    assemble(parts, groups, work)
    notes = subprocess.check_output(['node', '--input-type=module', '-e',
        "import {lessons} from './src/world/jamesLecture.js'; console.log(JSON.stringify(lessons))"], cwd=game)
    for i, lesson in enumerate(json.loads(notes)):
        for key, prefix in [('bridge', 'return'), ('answer', 'answer')]:
            wav, rate = engine.create(lesson[key], 'am_michael', speed=.93)
            path = work / 'aside.wav'
            sf.write(path, wav, rate)
            encode(path, destination / f'{prefix}-{i}.m4a')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', type=Path)
    parser.add_argument('voices', type=Path)
    parser.add_argument('--work', type=Path, help='Keep rendered phrases here for subsequent edits')
    args = parser.parse_args()
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        work = args.work or Path(temp)
        work.mkdir(parents=True, exist_ok=True)
        render(args.model, args.voices, work)
