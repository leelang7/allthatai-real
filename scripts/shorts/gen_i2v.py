# 커버 이미지 → 진짜 움직이는 영상(Stable Video Diffusion). 불꽃·빛·연기 등 내부 모션.
# 12GB VRAM 대응(cpu offload + chunk decode). SVD는 ~4초(25프레임) 생성 → 음악길이는 루프로 채움.
#   python gen_i2v.py <cover.jpg> [out.mp4] [motion_bucket(기본140)]
import sys
import torch
from pathlib import Path
from PIL import Image
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import export_to_video

MODEL = "stabilityai/stable-video-diffusion-img2vid-xt"


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python gen_i2v.py <cover.jpg> [out.mp4] [motion_bucket]")
    cover = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "_i2v_test.mp4"
    motion = int(sys.argv[3]) if len(sys.argv) > 3 else 140

    img = Image.open(cover).convert("RGB").resize((1024, 576))
    print("모델 로딩(첫 실행은 다운로드 ~9.5GB)…")
    pipe = StableVideoDiffusionPipeline.from_pretrained(MODEL, torch_dtype=torch.float16, variant="fp16")
    pipe.enable_model_cpu_offload()
    try:
        pipe.unet.enable_forward_chunking()
    except Exception:
        pass

    gen = torch.manual_seed(42)
    print(f"생성 중… motion_bucket={motion}")
    frames = pipe(img, decode_chunk_size=2, motion_bucket_id=motion,
                  noise_aug_strength=0.05, num_frames=25, generator=gen).frames[0]
    export_to_video(frames, out, fps=7)
    print("RESULT", out, "| frames:", len(frames))


if __name__ == "__main__":
    main()
