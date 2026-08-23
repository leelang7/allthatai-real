# @allthathz 채널 인증 — music_token.json(프로젝트1) / music_token2.json(프로젝트2) 생성.
# 로컬 서버를 안 띄우는 '수동 붙여넣기' 방식 → 포트8765 충돌·CSRF state 에러가 원천적으로 안 생김.
#   python auth_music.py        # 프로젝트1
#   python auth_music.py 2      # 프로젝트2 (쿼터 2배)
# 흐름: ①출력된 URL 열기 ②계정선택 후 반드시 @allthathz 채널 선택 ③"localhost 연결 안 됨"
#       페이지가 떠도 정상 — 브라우저 주소창의 전체 URL을 복사해서 붙여넣기.
import sys
from pathlib import Path
from google_auth_oauthlib.flow import Flow

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
HERE = Path(__file__).parent
REDIRECT = "http://localhost:8765/"


def main():
    proj = "2" if (len(sys.argv) > 1 and sys.argv[1].strip() == "2") else "1"
    if proj == "2":
        client = HERE / "client_secret2.json"
        token = HERE / "music_token2.json"
    else:
        client = HERE / ("music_client.json" if (HERE / "music_client.json").exists() else "client_secret.json")
        token = HERE / "music_token.json"
    if not client.exists():
        print("client 파일 없음:", client.name); return

    flow = Flow.from_client_secrets_file(str(client), scopes=SCOPES, redirect_uri=REDIRECT)
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent", include_granted_scopes="true")
    print("\n================ @allthathz 인증 (프로젝트" + proj + ") ================")
    print("1) 아래 URL을 브라우저에서 여세요:\n")
    print("   " + auth_url + "\n")
    print("2) 계정 선택 후 반드시 '@allthathz' 채널을 고르세요.")
    print("3) 끝나면 'localhost 연결할 수 없음' 페이지가 떠도 정상입니다.")
    print("   브라우저 주소창의 전체 URL(http://localhost:8765/?... 또는 code=...)을 복사하세요.\n")
    resp = input(">>> 그 URL(또는 code 값)을 여기 붙여넣고 Enter: ").strip()

    try:
        if resp.startswith("http"):
            flow.fetch_token(authorization_response=resp)
        else:
            flow.fetch_token(code=resp)  # code만 붙여넣어도 처리
    except Exception as e:
        print("\n인증 실패:", str(e)[:200])
        print("→ URL 전체를 복사했는지, @allthathz를 골랐는지 확인 후 다시 실행하세요.")
        return

    token.write_text(flow.credentials.to_json(), encoding="utf-8")
    print("\n저장됨:", token.name, "— 이제 이 프로젝트 쿼터로도 업로드됩니다.")


if __name__ == "__main__":
    main()
