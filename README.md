# 🎙️ VoiceCraft — Text to Speech Converter

**VoiceCraft** ek fast, free aur local **Text-to-Speech (TTS)** tool hai. Koi bhi text paste karo, voice choose karo, aur natural-sounding audio generate karke **MP3/WAV** download kar lo.

Ek hi **`run.bat`** click karo — bas. (Sab kuch automatic install ho jata hai)

---

## ✨ Features

- 🔊 **Neural voices** — Microsoft Edge neural voices (30+ voices: English, Hindi, Indian English, etc.)
- 🇮🇳 **Hindi support** — Swara, Ananya, Madhur aur bhi voices
- 📝 **Unlimited text length** — lambi books/articles bhi convert karo
- 🎚️ **Speed & Pitch control** — 0.5x – 2x speed, pitch adjust
- 💾 **Download as MP3/WAV** — ek click me file save
- 🔒 **100% Local** — audio aapke PC par banti hai, koi account nahi, koi API key nahi
- 🧠 **Smart fallback** — Edge TTS fail ho to → Google TTS → Windows SAPI (offline)
- ⚡ **Live preview** — chhoti text ke liye browser ki speech synthesis se instant playback

---

## 🚀 Quick Start (Windows) — Sabse aasan tarika

> **Requirement:** Windows 10/11. Node.js ki zaroorat nahi — run.bat khud install kar lega!

1. Is folder ko download karo aur kahin bhi extract karo (e.g. `Desktop\VoiceCraft`)
2. **`run.bat` par double-click karo**
3. Pehli baar me:
   - Node.js nahi hoga to **winget se auto-install** ho jayega (popup aaye to **Yes** karo)
   - Packages **npm se install** honge (1–2 minute, internet chahiye)
   - App **build** hogi
4. Browser me **http://127.0.0.1:4173** khul jayega ✅
5. Uske baad har baar `run.bat` click karo — **turant khulega** (build/install skip hota hai)

> ⚠️ App use karte waqt black console window **band mat karo** — wahi server chalata hai.

---

## 🖥️ Manual Start (developers ke liye)

```bash
# 1. Install packages
npm install

# 2. Dev mode (hot reload ke saath)
npm run dev

# 3. Production build + local server
npm run build
npm start
```

| Command | Kya karta hai |
|---|---|
| `run.bat` | Sab automatic: install + build + start |
| `npm run dev` | Vite dev server (port 5173) + TTS API (port 3001) |
| `npm run build` | Production build (`dist/`) |
| `npm start` | Build + TTS API + preview server (port 4173) |
| `npm run server` | Sirf TTS API server (port 3001) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

---

## 🗣️ Available Voices

| Language | Voices |
|---|---|
| American English (Female) | Heart, Bella, Nicole, Aoede, Kore, Sarah, Alloy, Nova, Sky, Jessica, River |
| American English (Male) | Michael, Fenrir, Puck, Echo, Eric, Liam, Onyx, Adam, Santa |
| British English | Emma, Isabella, Alice, Lily, George, Fable, Daniel, Lewis |
| Indian English | Neerja, Prabhat |
| Hindi 🇮🇳 | Swara, Ananya, Madhur |

---

## 🧩 Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons
- **Backend:** Node.js (zero-framework HTTP server, `node:http`)
- **TTS Engines:**
  1. **Edge Neural TTS** (primary — best quality, WebSocket based)
  2. **Google Translate TTS** (fallback)
  3. **Windows SAPI** (offline fallback — internet band ho to bhi chalega)
- **Legacy:** `backend/` me ek optional Python (Flask + gTTS) version bhi hai

---

## 📂 Project Structure

```
VoiceCraft/
├── run.bat              ← Double-click karne wali file ⭐
├── index.html
├── package.json
├── vite.config.ts
├── src/                 ← React app (UI)
│   ├── App.tsx
│   ├── hooks/           ← useTtsApi, useSpeechSynthesis, useAudioRecorder
│   └── lib/             ← text helpers
├── server/              ← Node.js TTS API
│   ├── start-local.mjs  ← App + API dono start karta hai
│   ├── tts.mjs          ← HTTP API + job queue + fallback chain
│   ├── edgeTts.mjs      ← Edge neural voices (WebSocket)
│   └── voices.mjs       ← Voice list
├── backend/             ← Optional Python version (Flask)
└── LICENSE              ← MIT License
```

---

## 🔌 API Endpoints (local, port 3001)

| Method | Endpoint | Kya karta hai |
|---|---|---|
| `GET` | `/api/health` | Server status |
| `GET` | `/api/voices` | Voice list |
| `POST` | `/api/generate` | Job start karo (text, voice, rate, pitch) |
| `GET` | `/api/generate/:id` | Progress check karo |
| `GET` | `/api/generate/:id/audio` | Ready audio download karo |
| `DELETE` | `/api/generate/:id` | Job cancel karo |
| `POST` | `/api/tts` | Direct audio response (sync) |

---

## 🔧 Troubleshooting (Problem aaye to)

| Problem | Solution |
|---|---|
| `run.bat` instantly band ho jata hai | Right-click → **Run as administrator**, ya console me manually chalao aur error dekho |
| Node.js install nahi hua | [nodejs.org](https://nodejs.org) se LTS manually install karo → PC restart → `run.bat` |
| `npm install` fail | Internet check karo, phir folder me `node_modules` delete karke `run.bat` dobara chalao |
| Audio generate nahi ho rahi | Internet zaroori hai (Edge/Google TTS ke liye). Internet band ho to **Windows SAPI** voices hi milengi |
| Port 4173 busy | Purani VoiceCraft window band karo, ya Task Manager me `node.exe` end karo |
| Antivirus warning | Windows SAPI PowerShell use karta hai — "Allow" kar dena |

---

## 🤝 Contributing

PRs welcome hain! Fork karo, branch banao, changes commit karo, aur Pull Request bhejo.

```bash
git fork → git checkout -b feature/awesome → commit → push → PR
```

---

## 📄 License

Ye project **[MIT License](LICENSE)** ke under licensed hai — free for personal & commercial use.

---

<div align="center">

**Made with ❤️ — VoiceCraft**

*Agar project pasand aaye to repo me ⭐ star de dena!*

</div>
