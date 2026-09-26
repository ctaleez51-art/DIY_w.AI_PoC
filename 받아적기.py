# 받아적기 서버 — 이 컴퓨터에서 Whisper 를 돌린다.
#
#   브라우저가 소리를 보내면 글자로 돌려준다. 밖으로 나가는 것이 없다.
#   주소는 http://127.0.0.1:8000 로 고정이라 화면에 칸을 둘 필요가 없다.
#
# 처음 한 번만:  pip install faster-whisper
# 켤 때:        python 받아적기.py
#
# GPU 가 없는 노트북을 쓰므로 CPU 로 돌린다.
# int8 로 줄여서 올리면 정확도는 거의 그대로면서 CPU 에서 몇 배 빨라진다.

import io
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

# 윈도우 콘솔이 한글을 깨뜨리지 않게 맞춘다
sys.stdout.reconfigure(encoding="utf-8")

포트 = 8000
모델크기 = "small"


# ------------------------------------------------------------
# 보내온 덩이에서 소리만 꺼낸다
#   브라우저가 multipart/form-data 로 보낸다. 칸이 하나뿐이라
#   경계선으로 자르고 머리글 다음의 알맹이만 집으면 된다.
# ------------------------------------------------------------

def 소리꺼내기(몸, 형식):
    표시 = "boundary="
    if 표시 not in 형식:
        raise ValueError("경계선이 없습니다")

    경계 = ("--" + 형식.split(표시, 1)[1].strip().strip('"')).encode()
    for 조각 in 몸.split(경계):
        자리 = 조각.find(b"\r\n\r\n")
        if 자리 == -1:
            continue
        알맹이 = 조각[자리 + 4:]
        if 알맹이.endswith(b"\r\n"):
            알맹이 = 알맹이[:-2]
        if 알맹이:
            return 알맹이

    raise ValueError("소리가 들어 있지 않습니다")


# ------------------------------------------------------------
# 서버
# ------------------------------------------------------------

class 받아적기집(BaseHTTPRequestHandler):
    def 머리글(self, 상태=200):
        self.send_response(상태)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def 답하기(self, 짐, 상태=200):
        self.머리글(상태)
        self.wfile.write(json.dumps(짐, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        # 배포된 https 사이트에서 이 컴퓨터(사설망)를 부를 때 크롬이 요구한다
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        self.답하기({"살아있음": True, "모델": 모델크기})

    def do_POST(self):
        if self.path.rstrip("/") != "/stt":
            self.답하기({"잘못": "여기가 아닙니다"}, 404)
            return

        길이 = int(self.headers.get("Content-Length", 0))
        if 길이 <= 0:
            self.답하기({"잘못": "보낸 것이 없습니다"}, 400)
            return

        try:
            소리 = 소리꺼내기(self.rfile.read(길이), self.headers.get("Content-Type", ""))
        except ValueError as 탈:
            self.답하기({"잘못": str(탈)}, 400)
            return

        시작 = time.time()
        try:
            토막들, _ = 모델.transcribe(
                io.BytesIO(소리),
                language="ko",
                beam_size=1,          # CPU 라 폭을 넓히지 않는다. 1 이면 몇 배 빠르다
                vad_filter=True,      # 말이 없는 구간은 건너뛴다
            )
            글 = "".join(토막.text for 토막 in 토막들).strip()
        except Exception as 탈:
            print(f"받아적기 실패: {탈}", flush=True)
            self.답하기({"잘못": "받아적지 못했습니다"}, 500)
            return

        걸린초 = round(time.time() - 시작, 1)
        print(f"[{걸린초}초] 들은 말: {글}", flush=True)
        self.답하기({"텍스트": 글, "걸린초": 걸린초})

    # 요청마다 한 줄씩 찍는 기본 기록은 시끄러워서 끈다
    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print(f"Whisper {모델크기} 를 올리는 중입니다. 처음이면 모델을 받느라 몇 분 걸립니다…", flush=True)
    모델 = WhisperModel(모델크기, device="cpu", compute_type="int8")
    print(f"준비됐습니다. http://127.0.0.1:{포트} 에서 기다립니다. 끄려면 Ctrl+C.", flush=True)

    try:
        ThreadingHTTPServer(("127.0.0.1", 포트), 받아적기집).serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")
