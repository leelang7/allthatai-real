# Suno mp3 + 커버 이미지 -> 유튜브용 1080p 음악 영상(mp4).
# 커버를 화면에 채우고 오디오 길이에 맞춰 정지영상 인코딩. 무거운 모션 없이 가볍고 안정적.
#   python make_music_video.py <song.mp3> [cover.jpg] [out.mp4]
# 커버 생략 시 단색 배경 + 파일명 텍스트로 자동 생성.
import subprocess
import sys
import os
from pathlib import Path

HERE = Path(__file__).parent


def duration(mp3: str) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", mp3],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        return float((out.stdout or "0").strip() or 0)
    except Exception:
        return 0.0


_ENC_CACHE = None


def video_encoder() -> list:
    """GPU(NVENC) 있으면 h264_nvenc, 없으면 libx264. ENCODER=cpu로 강제 가능."""
    global _ENC_CACHE
    if _ENC_CACHE is not None:
        return _ENC_CACHE
    if os.environ.get("ENCODER", "").strip().lower() == "cpu":
        _ENC_CACHE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
        return _ENC_CACHE
    try:
        enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"],
                             capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        if "h264_nvenc" in enc:
            _ENC_CACHE = ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "29", "-b:v", "0", "-maxrate", "6M", "-bufsize", "12M"]
            return _ENC_CACHE
    except Exception:
        pass
    _ENC_CACHE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
    return _ENC_CACHE


def make(mp3: str, cover: str | None, out: str) -> bool:
    if not os.path.exists(mp3):
        print("mp3 없음:", mp3)
        return False
    dur = duration(mp3)
    if dur <= 0:
        print("오디오 길이 0 — 손상?")
        return False

    # 커버 없으면 단색 배경 생성
    tmp_cover = None
    if not cover or not os.path.exists(cover):
        tmp_cover = str(HERE / "_music_cover.png")
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "color=c=0x10131a:s=1920x1080", "-frames:v", "1", tmp_cover,
        ], capture_output=True)
        cover = tmp_cover

    # MOTION=still 이면 가벼운 정지영상, 아니면 2.5D 켄번즈(잔잔한 줌+드리프트, 기본)
    motion = os.environ.get("MOTION", "kenburns").strip().lower()
    if motion == "still":
        vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
              "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x10131a")
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", cover,
            "-i", mp3,
            "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
            "-vf", vf, "-r", "2",  # 2fps면 충분(정지영상) — 용량·인코딩 최소
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", out,
        ]
    else:
        fps = 24
        frames = int(dur * fps) + 1
        # 소스를 1.4배(2688x1512) 확대 → 줌·패닝 헤드룸 확보.
        # 연속 모션: 줌이 '숨쉬듯' 1.07~1.21 사이를 계속 오가고(sin), 위치도 계속 표류 →
        # 곡 내내 멈추지 않고 살아 움직이는 2.5D 느낌(초반에 멈추던 문제 해결).
        vf = (
            "scale=2688:1512:force_original_aspect_ratio=increase,crop=2688:1512,"
            f"zoompan=z='1.14+0.07*sin(on/130)':d={frames}:fps={fps}"
            ":x='iw/2-(iw/zoom/2)+sin(on/170)*55':y='ih/2-(ih/zoom/2)+cos(on/210)*40'"
            ":s=1920x1080,setsar=1,format=yuv420p"
        )
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", cover,
            "-i", mp3,
            *video_encoder(), "-pix_fmt", "yuv420p",
            "-vf", vf, "-r", str(fps),
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", out,
        ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if tmp_cover and os.path.exists(tmp_cover):
        os.remove(tmp_cover)
    ok = os.path.exists(out) and os.path.getsize(out) > 50_000
    if not ok:
        print("인코딩 실패:", (r.stderr or "")[-300:])
    else:
        kb = os.path.getsize(out) // 1024
        print(f"RESULT {{\"mp4\":\"{out}\",\"dur\":{dur:.1f},\"kb\":{kb}}}")
    return ok


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python make_music_video.py <song.mp3> [cover.jpg] [out.mp4]")
    mp3 = sys.argv[1]
    cover = sys.argv[2] if len(sys.argv) > 2 else None
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.splitext(mp3)[0] + ".mp4"
    sys.exit(0 if make(mp3, cover, out) else 1)


if __name__ == "__main__":
    main()
