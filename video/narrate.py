# Generates the voiceover for the demo video, one WAV per line of video/narration.json.
# Kokoro-82M (Apache-2.0) via kokoro-onnx, fully offline once the model files are downloaded:
#   python3 -m venv .tts && .tts/bin/pip install kokoro-onnx soundfile
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
#   KOKORO_DIR=. .tts/bin/python video/narrate.py
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

root = os.path.dirname(os.path.abspath(__file__))
model_dir = os.environ.get("KOKORO_DIR", ".")
k = Kokoro(os.path.join(model_dir, "kokoro-v1.0.int8.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
lines = json.load(open(os.path.join(root, "narration.json")))
out = os.path.join(root, "narration")
os.makedirs(out, exist_ok=True)
durations = {}
for line in lines:
    samples, rate = k.create(line["text"], voice=os.environ.get("VOICE", "af_heart"), speed=float(os.environ.get("SPEED", "1.0")), lang="en-us")
    sf.write(os.path.join(out, line["id"] + ".wav"), samples, rate)
    durations[line["id"]] = round(len(samples) / rate, 2)
json.dump(durations, open(os.path.join(out, "durations.json"), "w"), indent=1)
print(durations, "total", round(sum(durations.values()), 1), "s", file=sys.stderr)
