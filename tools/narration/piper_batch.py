"""Synteza wielu tekstów jednym głosem Piper (model ładowany raz).

Wejście (stdin, JSON): {"model": "...onnx", "lengthScale": 0.8, "items": [{"text": "...", "out": "x.wav"}]}
Wywołuje go tools/narration/narration.ts — ręcznie nie trzeba.
"""

import json
import sys
import wave

from piper import PiperVoice, SynthesisConfig

job = json.load(sys.stdin)
voice = PiperVoice.load(job["model"])
config = SynthesisConfig(
    length_scale=job.get("lengthScale"),
    noise_scale=job.get("noiseScale"),
    noise_w_scale=job.get("noiseW"),
)
for i, item in enumerate(job["items"]):
    with wave.open(item["out"], "wb") as wav:
        voice.synthesize_wav(item["text"], wav, syn_config=config)
    print(f"\r  {i + 1}/{len(job['items'])}", end="", file=sys.stderr, flush=True)
print(file=sys.stderr)
