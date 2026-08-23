# 고품질 실사 배경 스틸 (RealVisXL V4.0, GPU). 인자: 배치파일(각 줄 "name|prompt")
import sys, torch
from diffusers import StableDiffusionXLPipeline
pipe = StableDiffusionXLPipeline.from_pretrained("SG161222/RealVisXL_V4.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True).to("cuda")
neg = "text, letters, words, watermark, logo, people, faces, low quality, blurry artifacts"
for line in open(sys.argv[1], encoding="utf-8"):
    line=line.strip()
    if not line or "|" not in line: continue
    name, prompt = line.split("|",1)
    img = pipe(prompt=prompt, negative_prompt=neg, num_inference_steps=30, guidance_scale=6.0, height=1024, width=576).images[0]
    img.save(f"bg_pool/{name}.png"); print("ok", name, flush=True)
