# Generates the voiceover for the demo video from video/narration.json.
#
# Every scene is a list of beats (one or two sentences). Each beat is synthesized on its own with
# Kokoro-82M (Apache-2.0, offline), trimmed, and joined with the pause written in the script, so the
# pacing is set by the script and not by the model. The start and end of every beat is written to
# video/narration/timing.json; video/record.mjs uses it to line the picture up with the words.
#
#   python3 -m venv .tts && .tts/bin/pip install kokoro-onnx soundfile numpy
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
#   KOKORO_DIR=. .tts/bin/python video/narrate.py
#
# Use the full kokoro-v1.0.onnx, not the int8 file: the quantized model sounds noticeably rougher.
# VOICE=am_michael (or any Kokoro voice) and SPEED=0.95 override the script's settings.
import json, os, re, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

root = os.path.dirname(os.path.abspath(__file__))
model_dir = os.environ.get("KOKORO_DIR", ".")
script = json.load(open(os.path.join(root, "narration.json"), encoding="utf-8"))
voice = os.environ.get("VOICE", script.get("voice", "af_heart"))
speed = float(os.environ.get("SPEED", script.get("speed", 1.0)))
say = script.get("say", {})  # spelling the model reads correctly, e.g. Fabi -> Fahbee
out = os.environ.get("OUT", os.path.join(root, "narration"))
os.makedirs(out, exist_ok=True)

k = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))


def spoken(text):
    for word, sound in say.items():
        text = re.sub(rf"\b{re.escape(word)}\b", sound, text)
    return text


def trim(x, rate, floor=0.012, keep=0.04):
    """Cut the silence the model leaves before and after a line, keeping a short tail."""
    loud = np.flatnonzero(np.abs(x) > floor)
    if not len(loud):
        return x
    a = max(0, loud[0] - int(keep * rate))
    b = min(len(x), loud[-1] + int(keep * 2 * rate))
    x = x[a:b].copy()
    fade = int(0.01 * rate)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    return x


timing, total = {}, 0.0
for scene in script["scenes"]:
    parts, beats, t, rate = [], [], 0.0, 24000
    for beat in scene["beats"]:
        samples, rate = k.create(spoken(beat["text"]), voice=voice, speed=speed, lang="en-us")
        samples = trim(np.asarray(samples, dtype=np.float32), rate)
        dur = len(samples) / rate
        beats.append({"start": round(t, 3), "end": round(t + dur, 3), "text": beat["text"]})
        parts += [samples, np.zeros(int(beat.get("pause", 0.35) * rate), dtype=np.float32)]
        t += dur + beat.get("pause", 0.35)
    sf.write(os.path.join(out, scene["id"] + ".wav"), np.concatenate(parts), rate)
    timing[scene["id"]] = {"duration": round(t, 3), "beats": beats}
    total += t
json.dump({"voice": voice, "speed": speed, "scenes": timing}, open(os.path.join(out, "timing.json"), "w"), indent=1, ensure_ascii=False)
print(f"{voice} at {speed}: {total:.1f} s of narration in {len(timing)} scenes", file=sys.stderr)
