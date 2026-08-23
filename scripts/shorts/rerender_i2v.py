# 수노 커버 → SVD i2v 애니메이션 → 곡 길이 루프 → 음악 입힌 영상으로 일괄 교체.
# SVD 모델을 1회만 로드하고 곡들을 순회(곡당 ~5분). .i2v_done.json 으로 재개 가능.
# 우선순위: 업로드 예정(연주곡·미업로드)부터. env I2V_ALL=1 이면 141곡 전부.
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import torch
from PIL import Image
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import export_to_video

HERE = Path(__file__).parent
MUSIC = HERE / "music"
META = MUSIC / ".meta.json"
STATUS = MUSIC / ".sync_status.json"
DONE = MUSIC / ".i2v_done.json"
MODEL = "stabilityai/stable-video-diffusion-img2vid-xt"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def progress(state, msg="", current=0, total=0):
    try:
        STATUS.write_text(json.dumps(
            {"state": state, "msg": msg, "current": current, "total": total, "added": current},
            ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def duration(mp3: str) -> float:
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "default=nw=1:nk=1", mp3], capture_output=True, text=True)
        return float((out.stdout or "0").strip() or 0)
    except Exception:
        return 0.0


def video_encoder():
    try:
        enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        if "h264_nvenc" in enc:
            return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "29", "-b:v", "0", "-maxrate", "6M", "-bufsize", "12M"]
    except Exception:
        pass
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]


def interp_filter() -> str:
    """보간 방식. INTERP=blend(뭉개짐 없음·살짝 부드럽게) / mci(부드럽지만 워핑위험) / none(원본 12fps 또렷·약간 끊김)."""
    mode = os.environ.get("INTERP", "blend").strip().lower()
    if mode == "mci":
        return "minterpolate=fps=24:mi_mode=mci:mc_mode=obmc:me_mode=bidir:vsbmc=0"
    if mode == "none":
        return "fps=24"  # 프레임 복제(보간 안 함) — 워핑 0, 디테일 또렷
    return "minterpolate=fps=24:mi_mode=blend"  # 블렌드 — 워핑 없이 부드럽게


def build_video(clip: str, mp3: str, out: str):
    """짧은 i2v 클립 → 보간 → 왕복 루프 → 곡 길이 → 1080p → 음악 합성."""
    dur = duration(mp3)
    enc = video_encoder()
    vf = (interp_filter() + ","
          "scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p")
    boom = clip + ".boom.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", clip, "-filter_complex",
                    f"[0:v]{vf},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]",
                    "-map", "[v]", "-an", boom], capture_output=True)
    # 보간 왕복본을 곡 길이만큼 루프 + 음악
    subprocess.run(["ffmpeg", "-y", "-stream_loop", "-1", "-i", boom, "-i", mp3,
                    *enc, "-r", "24", "-c:a", "aac", "-b:a", "192k",
                    "-t", f"{dur:.2f}", "-shortest", out], capture_output=True)
    try:
        os.remove(boom)
    except Exception:
        pass
    return os.path.exists(out) and os.path.getsize(out) > 100_000


def target_list(meta: dict):
    """업로드 예정(연주곡·미업로드) 우선, 그다음 나머지. I2V_ALL=1 이면 전부."""
    all_mode = os.environ.get("I2V_ALL", "") == "1"
    items = []
    for nm, m in meta.items():
        if not (MUSIC / (nm[:-4] + ".jpg")).exists():
            continue
        is_inst = m.get("instrumental") is True
        uploaded = m.get("status") == "uploaded"
        if all_mode or is_inst:
            # 우선순위 점수: 미업로드 연주곡(0) < 업로드된 연주곡(1) < 나머지(2)
            pr = 0 if (is_inst and not uploaded) else (1 if is_inst else 2)
            items.append((pr, nm, m))
    items.sort(key=lambda x: (x[0], (x[2].get("title") or x[1])))
    return [(nm, m) for _, nm, m in items]


def main():
    if not META.exists():
        progress("error", "메타 없음"); return
    meta = json.loads(META.read_text(encoding="utf-8"))
    done = set()
    if DONE.exists():
        try:
            done = set(json.loads(DONE.read_text(encoding="utf-8")))
        except Exception:
            pass
    targets = [(nm, m) for nm, m in target_list(meta) if nm not in done]
    limit = int(os.environ.get("I2V_LIMIT", "0"))  # >0 이면 그만큼만(검토용 배치)
    if limit > 0:
        targets = targets[:limit]
    total = len(targets)
    if not total:
        progress("done", "i2v 전부 완료", 0, 0); print("RESULT 대상 없음(전부 완료)"); return

    print(f"i2v 대상 {total}곡 (모델 1회 로드, 곡당 ~5분)")
    progress("download", "SVD 모델 로딩…", 0, total)
    pipe = StableVideoDiffusionPipeline.from_pretrained(MODEL, torch_dtype=torch.float16, variant="fp16")
    pipe.enable_model_cpu_offload()
    try:
        pipe.unet.enable_forward_chunking()
    except Exception:
        pass

    ok = 0
    for i, (nm, m) in enumerate(targets, 1):
        base = nm[:-4]
        cover = MUSIC / (base + ".jpg")
        mp3 = MUSIC / (base + ".mp3")
        out = MUSIC / (base + ".mp4")
        title = m.get("title") or base
        progress("download", f"i2v: {title}", i, total)
        try:
            img = Image.open(cover).convert("RGB").resize((1024, 576))
            gen = torch.manual_seed(42)
            mbucket = int(os.environ.get("MOTION_BUCKET", "110"))  # 낮을수록 모션↓·디테일 보존↑
            frames = pipe(img, decode_chunk_size=2, motion_bucket_id=mbucket,
                          noise_aug_strength=0.02, num_frames=25, generator=gen).frames[0]
            with tempfile.TemporaryDirectory() as td:
                clip = os.path.join(td, "c.mp4")
                export_to_video(frames, clip, fps=7)
                if build_video(clip, str(mp3), str(out)):
                    ok += 1
                    done.add(nm)
                    DONE.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
                    print(f"[{i}/{total}] OK {title}")
                else:
                    print(f"[{i}/{total}] 합성 실패 {title}")
        except Exception as e:
            print(f"[{i}/{total}] 실패 {title}: {str(e)[:120]}")
    progress("done", f"i2v 완료 {ok}/{total}", total, total)
    print(f"RESULT i2v {ok}/{total} 완료")


if __name__ == "__main__":
    main()
