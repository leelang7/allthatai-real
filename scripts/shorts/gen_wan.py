# Local AI b-roll via Wan 2.1 (1.3B) — more stable than LTX on 12GB.
# VAE in fp32 to avoid blank/black output; transformer bf16 + cpu offload.
import sys
import torch
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.utils import export_to_video

PROMPT = sys.argv[1] if len(sys.argv) > 1 else (
    "Cinematic aerial drone shot flying over a small tropical island in turquoise "
    "Caribbean sea, white sand beach, gentle waves, palm trees, warm golden hour, "
    "slow smooth camera, photorealistic"
)
OUT = sys.argv[2] if len(sys.argv) > 2 else "scripts/shorts/_bg_wan.mp4"
W = int(sys.argv[3]) if len(sys.argv) > 3 else 480
H = int(sys.argv[4]) if len(sys.argv) > 4 else 832
FRAMES = int(sys.argv[5]) if len(sys.argv) > 5 else 81  # ~5s @16fps
STEPS = int(sys.argv[6]) if len(sys.argv) > 6 else 25   # 25 ~ good bg quality, faster than 30

MODEL = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
print("loading Wan 2.1 1.3B … (first run downloads weights)")
vae = AutoencoderKLWan.from_pretrained(MODEL, subfolder="vae", torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(MODEL, vae=vae, torch_dtype=torch.bfloat16)
pipe.enable_model_cpu_offload()

print(f"generating {W}x{H} {FRAMES}f: {PROMPT[:60]}…")
frames = pipe(
    prompt=PROMPT,
    negative_prompt="worst quality, blurry, distorted, deformed, low resolution, jpeg artifacts, text, watermark, static, still",
    width=W, height=H, num_frames=FRAMES,
    guidance_scale=5.0, num_inference_steps=STEPS,
).frames[0]

export_to_video(frames, OUT, fps=16)
print("wrote", OUT)
