# Cloud video gen via fal.ai (Kling / Hailuo etc.) for quality comparison vs local.
import os
import sys
import urllib.request
from pathlib import Path

# load FAL_KEY from .env (no dotenv dependency)
envf = Path(__file__).resolve().parents[2] / ".env"
if envf.exists():
    for line in envf.read_text(encoding="utf-8").splitlines():
        if line.startswith("FAL_KEY="):
            os.environ["FAL_KEY"] = line.split("=", 1)[1].strip()

import fal_client  # noqa: E402

PROMPT = sys.argv[1] if len(sys.argv) > 1 else (
    "Cinematic aerial drone shot flying over a small tropical island in turquoise "
    "Caribbean sea, white sand beach, gentle waves, palm trees, warm golden hour, "
    "slow smooth camera, photorealistic, 4k"
)
OUT = sys.argv[2] if len(sys.argv) > 2 else "scripts/shorts/_bg_api.mp4"
MODEL = os.environ.get("FAL_MODEL", "fal-ai/kling-video/v1.6/standard/text-to-video")

print("model:", MODEL)
print("prompt:", PROMPT[:70], "…")

result = fal_client.subscribe(
    MODEL,
    arguments={"prompt": PROMPT, "duration": "5", "aspect_ratio": "9:16"},
    with_logs=True,
    on_queue_update=lambda u: None,
)

print("result keys:", list(result.keys()))
video = result.get("video") or {}
url = video.get("url") if isinstance(video, dict) else None
url = url or result.get("url")
if not url:
    print("NO VIDEO URL — full result:", result)
    sys.exit(1)

urllib.request.urlretrieve(url, OUT)
print("wrote", OUT)
