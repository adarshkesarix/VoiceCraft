import io
import re

from flask import Flask, jsonify, request, send_file
from gtts import gTTS

app = Flask(__name__)



VOICES = [
    {"name": "en-US", "displayName": "English (US)", "gender": "Female", "locale": "en-US", "lang": "en", "tld": "com"},
    {"name": "en-GB", "displayName": "English (UK)", "gender": "Female", "locale": "en-GB", "lang": "en", "tld": "co.uk"},
    {"name": "en-IN", "displayName": "English (India)", "gender": "Female", "locale": "en-IN", "lang": "en", "tld": "co.in"},
    {"name": "en-AU", "displayName": "English (Australia)", "gender": "Female", "locale": "en-AU", "lang": "en", "tld": "com.au"},
    {"name": "hi-IN", "displayName": "Hindi", "gender": "Female", "locale": "hi-IN", "lang": "hi", "tld": "co.in"},
    {"name": "es-ES", "displayName": "Spanish", "gender": "Female", "locale": "es-ES", "lang": "es", "tld": "es"},
    {"name": "fr-FR", "displayName": "French", "gender": "Female", "locale": "fr-FR", "lang": "fr", "tld": "fr"},
    {"name": "de-DE", "displayName": "German", "gender": "Female", "locale": "de-DE", "lang": "de", "tld": "de"},
    {"name": "ja-JP", "displayName": "Japanese", "gender": "Female", "locale": "ja-JP", "lang": "ja", "tld": "co.jp"},
    {"name": "ko-KR", "displayName": "Korean", "gender": "Female", "locale": "ko-KR", "lang": "ko", "tld": "com"},
    {"name": "pt-BR", "displayName": "Portuguese (Brazil)", "gender": "Female", "locale": "pt-BR", "lang": "pt", "tld": "com.br"},
    {"name": "it-IT", "displayName": "Italian", "gender": "Female", "locale": "it-IT", "lang": "it", "tld": "it"},
    {"name": "ar", "displayName": "Arabic", "gender": "Female", "locale": "ar", "lang": "ar", "tld": "com"},
    {"name": "zh-CN", "displayName": "Chinese", "gender": "Female", "locale": "zh-CN", "lang": "zh-CN", "tld": "com"},
    {"name": "ru-RU", "displayName": "Russian", "gender": "Female", "locale": "ru-RU", "lang": "ru", "tld": "com"},
    {"name": "bn", "displayName": "Bengali", "gender": "Female", "locale": "bn", "lang": "bn", "tld": "com"},
    {"name": "ta", "displayName": "Tamil", "gender": "Female", "locale": "ta", "lang": "ta", "tld": "com"},
    {"name": "te", "displayName": "Telugu", "gender": "Female", "locale": "te", "lang": "te", "tld": "com"},
    {"name": "mr", "displayName": "Marathi", "gender": "Female", "locale": "mr", "lang": "mr", "tld": "com"},
    {"name": "gu", "displayName": "Gujarati", "gender": "Female", "locale": "gu", "lang": "gu", "tld": "com"},
]

VOICE_MAP = {v["name"]: v for v in VOICES}


def parse_slow(rate: str) -> bool:
    rate = (rate or "+0%").strip()
    match = re.match(r"^([+-]?\d+)%$", rate)
    if not match:
        return False
    return int(match.group(1)) <= -30


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/voices")
def get_voices():
    return jsonify(
        [
            {
                "name": v["name"],
                "displayName": v["displayName"],
                "gender": v["gender"],
                "locale": v["locale"],
            }
            for v in VOICES
        ]
    )


@app.post("/api/tts")
def tts():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    voice_name = (data.get("voice") or "en-US").strip()
    voice = VOICE_MAP.get(voice_name, VOICE_MAP["en-US"])
    slow = parse_slow(data.get("rate"))

    buf = io.BytesIO()
    try:
        engine = gTTS(text=text, lang=voice["lang"], tld=voice["tld"], slow=slow)
        engine.write_to_fp(buf)
    except Exception:
        try:
            engine = gTTS(text=text, lang="en", tld="com", slow=slow)
            engine.write_to_fp(buf)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    buf.seek(0)
    if buf.getbuffer().nbytes == 0:
        return jsonify({"error": "empty audio"}), 500

    return send_file(
        buf,
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="voicecraft.mp3",
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001, threaded=True)
