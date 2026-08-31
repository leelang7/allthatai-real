# -*- coding: utf-8 -*-
"""
주제별 배경 영상 생성. 카드뉴스와 '똑같은' 메시 그라디언트를 쇼츠 배경으로도 쓴다.
bg_pool 클립(테마당 1개)을 반복해서 배경이 다 똑같아지던 문제의 해결.

사용: python make_bg.py <topic> <out.mp4> [W] [H] [seconds]
Chrome으로 메시 PNG 렌더 → ffmpeg 느린 줌으로 은은한 모션.
"""
import sys, os, subprocess, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_cardnews import palette, mesh, CHROME

def render_png(topic, w, h, outpng):
    pal = palette(topic)
    htmlstr = (f"<!doctype html><html><head><meta charset='utf-8'><style>"
               f"*{{margin:0;padding:0}}html,body{{width:{w}px;height:{h}px;overflow:hidden}}"
               f".bg{{width:{w}px;height:{h}px;background:{mesh(pal)}}}"
               f"</style></head><body><div class='bg'></div></body></html>")
    tmp = outpng.replace(".png", ".html")
    open(tmp, "w", encoding="utf-8").write(htmlstr)
    url = "file:///" + tmp.replace("\\", "/")
    # **전용 프로필을 반드시 준다.**
    # --user-data-dir 없이 띄우면 사용자가 쓰던 기본 프로필을 잡고, 이 헤드리스
    # 작업이 끝날 때 열려 있던 크롬 창까지 같이 내려간다. 쿼터가 하루 12번 도는
    # 동안 크롬이 계속 꺼지던 원인이었다. (make_cardnews.py 는 원래 이렇게 한다)
    udd = os.path.join(tempfile.gettempdir(), "shorts_bg_chrome")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--no-first-run", "--no-default-browser-check",
                    f"--user-data-dir={udd}",
                    "--force-device-scale-factor=1", f"--window-size={w},{h}",
                    "--allow-file-access-from-files", f"--screenshot={outpng}", url],
                   capture_output=True, timeout=90)
    os.remove(tmp)

def main():
    topic, out = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 1080
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 1920
    secs = int(sys.argv[5]) if len(sys.argv) > 5 else 36
    img = sys.argv[6] if len(sys.argv) > 6 else ""   # 콘텐츠 스틸이 있으면 그걸 켄번스, 없으면 메시
    png = out[:-4] + "_still.png"
    made_png = False
    if img and os.path.exists(img):
        # 스틸을 9:16으로 스케일·크롭
        subprocess.run(["ffmpeg", "-y", "-i", img, "-vf",
                        f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                        png, "-loglevel", "error"], timeout=60)
        made_png = os.path.exists(png)
    if not made_png:
        render_png(topic, w, h, png)   # 폴백: 주제색 메시
    frames = secs * 30
    # 느린 줌(1.0→~1.06). 쇼츠 길이보다 길게 만들어 루프 리셋이 안 보이게.
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-i", png, "-t", str(secs),
                    "-vf", (f"scale={w}:{h},zoompan=z='min(zoom+0.00016,1.06)':"
                            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps=30,format=yuv420p"),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                    out, "-loglevel", "error"], timeout=240)
    os.remove(png)
    print("bg ->", out)

if __name__ == "__main__":
    main()
