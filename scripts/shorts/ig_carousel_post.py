# 인스타 카드뉴스 캐러셀 자동 발행.
#   - 폴더의 PNG들을 공개 호스트(catbox.moe, 무료·무인증)에 올려 public URL 확보
#   - Instagram Graph API로 캐러셀(여러 장) 컨테이너 생성 → 발행
# 사용: python ig_carousel_post.py <카드폴더> "<캡션>"
#   env IG_TOKEN(필수), IG_USER_ID(선택 - 없으면 토큰으로 자동조회)
import os, sys, time, glob, json, mimetypes, urllib.request, urllib.parse
import requests
try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp949 콘솔에서 한글/이모지 출력 안전
except Exception:
    pass

GRAPH = "https://graph.facebook.com/v21.0"          # Facebook-login 토큰
IG_GRAPH = "https://graph.instagram.com/v21.0"       # Instagram-login 토큰
CATBOX = "https://catbox.moe/user/api.php"

import base64, subprocess, tempfile

def _served_ok(url):
    """URL이 실제로 0바이트 아닌 이미지를 주는지 검증(catbox가 200+0byte로 죽는 케이스 방어)."""
    try:
        h = requests.head(url, timeout=20, allow_redirects=True)
        cl = int(h.headers.get("content-length", "0") or "0")
        return cl > 1000
    except Exception:
        return False

def _catbox(path):
    with open(path, "rb") as f:
        r = requests.post(CATBOX, data={"reqtype": "fileupload"},
                          files={"fileToUpload": (os.path.basename(path), f,
                                 mimetypes.guess_type(path)[0] or "image/png")}, timeout=120)
    u = r.text.strip()
    if not u.startswith("http"):
        return None
    time.sleep(1)
    return u if _served_ok(u) else None

GH_REPO = os.environ.get("GH_HOST_REPO", "leelang7/allthatlink-cards")  # 전용 asset repo
GH_DIR = os.environ.get("GH_HOST_DIR", "cards")

def _github(path):
    """유저 소유 공개 repo에 커밋 → raw.githubusercontent.com 직링크(IG가 안정적으로 fetch)."""
    name = f"{int(time.time())}_{os.path.basename(path)}"
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    payload = json.dumps({"message": f"ig card asset {name}", "content": b64})
    tf = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    tf.write(payload); tf.close()
    try:
        r = subprocess.run(["gh", "api", "-X", "PUT",
                            f"repos/{GH_REPO}/contents/{GH_DIR}/{name}", "--input", tf.name],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        if r.returncode != 0:
            return None
        raw = f"https://raw.githubusercontent.com/{GH_REPO}/main/{GH_DIR}/{name}"
        for _ in range(10):
            if _served_ok(raw): return raw
            time.sleep(2)
        return raw
    finally:
        try: os.unlink(tf.name)
        except Exception: pass

def _tmpfiles(path):
    with open(path, "rb") as f:
        r = requests.post("https://tmpfiles.org/api/v1/upload",
                          files={"file": (os.path.basename(path), f,
                                 mimetypes.guess_type(path)[0] or "image/png")}, timeout=120)
    try:
        u = r.json()["data"]["url"]  # 뷰어 URL -> /dl/ 직링크로 변환(IG가 직접 fetch)
        return u.replace("tmpfiles.org/", "tmpfiles.org/dl/", 1)
    except Exception:
        return None

def host_image(path):
    """공개 이미지 URL 확보. catbox(바이트검증) 2회 → GitHub raw(유저 repo) → tmpfiles 순 폴백."""
    for i in range(2):
        try:
            u = _catbox(path)
            if u: return u
        except Exception:
            pass
        time.sleep(2)
    try:
        u = _github(path)
        if u: return u
    except Exception:
        pass
    u = _tmpfiles(path)
    if u: return u
    raise RuntimeError(f"호스팅 실패(catbox+github+tmpfiles): {os.path.basename(path)}")

def api_base(token):
    """토큰 종류 자동판별: IG-login 토큰이면 graph.instagram.com."""
    try:
        r = requests.get(f"{IG_GRAPH}/me", params={"fields": "user_id,username", "access_token": token}, timeout=30)
        if r.status_code == 200 and "user_id" in r.json():
            return IG_GRAPH, r.json()["user_id"]
    except Exception:
        pass
    return GRAPH, None

def resolve_ig_user(base, token):
    if os.environ.get("IG_USER_ID"):
        return os.environ["IG_USER_ID"]
    # Facebook-login: 페이지 → instagram_business_account
    r = requests.get(f"{base}/me/accounts", params={"access_token": token, "fields": "instagram_business_account,name"}, timeout=30).json()
    for pg in r.get("data", []):
        iba = pg.get("instagram_business_account")
        if iba:
            return iba["id"]
    raise RuntimeError("IG User ID 못 찾음. 페이지-인스타 연결 확인 또는 IG_USER_ID 환경변수로 지정.")

def create_item(base, ig_id, token, image_url):
    r = requests.post(f"{base}/{ig_id}/media",
        data={"image_url": image_url, "is_carousel_item": "true", "access_token": token}, timeout=60).json()
    if "id" not in r: raise RuntimeError(f"아이템 생성 실패: {r}")
    return r["id"]

def main():
    if len(sys.argv) < 3:
        sys.exit('사용: python ig_carousel_post.py <카드폴더> "<캡션>"')
    folder, caption = sys.argv[1], sys.argv[2]
    token = os.environ.get("IG_TOKEN")
    tokfile = os.path.join(os.path.dirname(__file__), "ig_token.txt")
    if not token and os.path.exists(tokfile):
        token = open(tokfile).read().strip()          # 저장된 장기토큰 자동 로드
    if not token: sys.exit("IG_TOKEN 없음 (env 또는 ig_token.txt)")
    # 장기토큰 자동 갱신(만료 전 호출 시 60일 연장) — 실패해도 무시
    try:
        rr = requests.get("https://graph.instagram.com/refresh_access_token",
                          params={"grant_type": "ig_refresh_token", "access_token": token}, timeout=20).json()
        if rr.get("access_token"):
            token = rr["access_token"]; open(tokfile, "w").write(token)
    except Exception:
        pass
    files = sorted(glob.glob(os.path.join(folder, "*.png")))
    files = [f for f in files if not os.path.basename(f).startswith("_")]  # _전체보기 등 제외
    if not files: sys.exit(f"PNG 없음: {folder}")
    if len(files) > 10: files = files[:10]  # 캐러셀 최대 10장
    print(f"발행 대상 {len(files)}장:", [os.path.basename(f) for f in files])

    base, ig_from_token = api_base(token)
    ig_id = ig_from_token or resolve_ig_user(base, token)
    print(f"API: {base} · IG User ID: {ig_id}")

    child_ids = []
    for f in files:
        url = host_image(f); print("  호스팅:", os.path.basename(f), "→", url)
        child_ids.append(create_item(base, ig_id, token, url))

    # 캐러셀 컨테이너
    cont = requests.post(f"{base}/{ig_id}/media",
        data={"media_type": "CAROUSEL", "children": ",".join(child_ids),
              "caption": caption, "access_token": token}, timeout=60).json()
    if "id" not in cont: raise RuntimeError(f"캐러셀 컨테이너 실패: {cont}")
    # 처리 대기
    for _ in range(20):
        st = requests.get(f"{base}/{cont['id']}", params={"fields": "status_code", "access_token": token}, timeout=30).json()
        if st.get("status_code") == "FINISHED": break
        time.sleep(3)
    pub = requests.post(f"{base}/{ig_id}/media_publish",
        data={"creation_id": cont["id"], "access_token": token}, timeout=60).json()
    if "id" not in pub: raise RuntimeError(f"발행 실패: {pub}")
    print("[OK] 발행 완료 media id:", pub["id"])
    try:
        perma = requests.get(f"{base}/{pub['id']}", params={"fields": "permalink", "access_token": token}, timeout=30).json().get("permalink")
        if perma: print("[URL]", perma)
    except Exception:
        pass

if __name__ == "__main__":
    main()
