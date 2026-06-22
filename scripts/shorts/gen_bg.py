# Local AI b-roll background generator (LTX-Video, fully local, free).
# Tuned for 12GB VRAM (RTX 4070 SUPER): cpu offload + VAE tiling, 9:16.
import sys
import torch
from diffusers import LTXPipeline
from diffusers.utils import export_to_video

PROMPT = sys.argv[1] if len(sys.argv) > 1 else (
    "Cinematic aerial drone shot of a small tropical island in turquoise Caribbean "
    "sea, gentle rolling waves, warm golden sunset light, soft clouds, slow smooth "
    "camera movement, high detail, film grain"
)
OUT = sys.argv[2] if len(sys.argv) > 2 else "scripts/shorts/_bg.mp4"
# 9:16 exact (576/1024 = 0.5625). LTX needs dims divisible by 32, frames = 8n+1.
W = int(sys.argv[3]) if len(sys.argv) > 3 else 576
H = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
FRAMES = int(sys.argv[5]) if len(sys.argv) > 5 else 97  # ~4s @24fps

print(f"loading LTX-Video … (first run downloads weights)")
pipe = LTXPipeline.from_pretrained("Lightricks/LTX-Video", torch_dtype=torch.bfloat16)
pipe.enable_model_cpu_offload()
pipe.vae.enable_tiling()

print(f"generating {W}x{H} {FRAMES}f: {PROMPT[:60]}…")
video = pipe(
    prompt=PROMPT,
    negative_prompt="worst quality, blurry, jittery, distorted, deformed, text, watermark, logo",
    width=W, height=H, num_frames=FRAMES,
    num_inference_steps=30, guidance_scale=3.0,
).frames[0]

export_to_video(video, OUT, fps=24)
print("wrote", OUT)
