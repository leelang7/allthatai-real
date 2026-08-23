# -*- coding: utf-8 -*-
"""
콘텐츠별 배경 스틸 1장 생성 (RealVisXL V4.0, 로컬 GPU).
카드뉴스 배경 + 쇼츠 배경(켄번스)에 공용으로 쓴다. 테마 반복이 아니라 주제마다 고유.

사용: python gen_still.py "<영문 프롬프트>" <out.png> [W] [H] [steps] [seed]
- 텍스트/글자 억제 강력(SDXL이 배경에 헛글자 자주 박음).
- 인물 장면이면 한국인으로. 배경은 텍스트 얹을 수 있게 여백/저채도 지향.
"""
import sys, os, torch
from diffusers import StableDiffusionXLPipeline

PROMPT = sys.argv[1]
OUT = sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 896
H = int(sys.argv[4]) if len(sys.argv) > 4 else 1344
STEPS = int(sys.argv[5]) if len(sys.argv) > 5 else 28
SEED = int(sys.argv[6]) if len(sys.argv) > 6 else 0

NEG = ("text, letters, words, typography, captions, subtitles, watermark, logo, signage, "
       "billboard, poster, label, gibberish text, garbled letters, random symbols, "
       "western caucasian people, white people, US dollar, euro, foreign currency, "
       "low quality, blurry, jpeg artifacts, deformed, extra limbs, oversaturated, cluttered")

# 텍스트 얹을 공간 확보 + 프리미엄 톤. 다크 시네마틱 지향.
STYLE = (", cinematic, moody dark tones, soft depth of field, premium editorial photography, "
         "negative space, subtle bokeh, muted color grade, high detail, 8k")

def main():
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "SG161222/RealVisXL_V4.0", torch_dtype=torch.float16,
        variant="fp16", use_safetensors=True)
    # 저VRAM 공존 모드: 다른 GPU 서비스(AllThatLink 음성 등)와 VRAM 충돌 안 나게
    # cpu offload + attention/vae slicing. .to("cuda") 대신(그건 7GB 상주 → 충돌).
    # LOWVRAM=1 이면 sequential offload(모듈 단위 이동, ~1-2GB만 점유, 느림) — 음성서비스가 VRAM 많이 쓸 때.
    if os.environ.get("LOWVRAM"):
        pipe.enable_sequential_cpu_offload()
    else:
        pipe.enable_model_cpu_offload()
    pipe.enable_attention_slicing()
    try: pipe.enable_vae_tiling()
    except Exception: pass
    pipe.set_progress_bar_config(disable=True)
    g = torch.Generator("cpu").manual_seed(SEED)
    img = pipe(prompt=PROMPT + STYLE, negative_prompt=NEG,
               num_inference_steps=STEPS, guidance_scale=6.0,
               width=W, height=H, generator=g).images[0]
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    img.save(OUT)
    print("wrote", OUT)

if __name__ == "__main__":
    main()
