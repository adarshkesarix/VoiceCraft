import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`;

const WSS_HEADERS = {
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'User-Agent': UA,
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
};

let clockSkewSeconds = 0;

function unixNow() {
  return Date.now() / 1000 + clockSkewSeconds;
}

function generateSecMsGec() {
  let ticks = unixNow() + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks = Math.floor(ticks * 1e7);
  return createHash('sha256')
    .update(`${ticks}${TRUSTED_CLIENT_TOKEN}`, 'ascii')
    .digest('hex')
    .toUpperCase();
}

function connectId() {
  return randomUUID().replace(/-/g, '');
}

function jsDate() {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

function xmlEscape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(text) {
  let out = '';
  for (const ch of String(text)) {
    const code = ch.codePointAt(0) || 0;
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) {
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

function parseHeaders(buf, headerLength) {
  const header = buf.subarray(0, headerLength).toString('utf8');
  const map = new Map();
  for (const line of header.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return map;
}

function toEdgeVoice(name) {
  const raw = String(name || '').trim();
  if (raw.startsWith('Microsoft Server Speech Text to Speech Voice')) return raw;
  const match = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(raw);
  if (!match) return raw;
  let region = match[2];
  let speaker = match[3];
  if (speaker.includes('-')) {
    const parts = speaker.split('-');
    region = `${region}-${parts[0]}`;
    speaker = parts.slice(1).join('-');
  }
  return `Microsoft Server Speech Text to Speech Voice (${match[1]}-${region}, ${speaker})`;
}

function makeSsml(voice, text, rate, pitch) {
  const edgeVoice = toEdgeVoice(voice);
  return (
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
    `<voice name='${edgeVoice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>` +
    `${xmlEscape(cleanText(text))}` +
    '</prosody></voice></speak>'
  );
}

function wssUrl() {
  return (
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&ConnectionId=${connectId()}` +
    `&Sec-MS-GEC=${generateSecMsGec()}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
  );
}

function openSocket(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wssUrl(), {
      headers: {
        ...WSS_HEADERS,
        Cookie: `muid=${randomBytes(16).toString('hex').toUpperCase()};`,
      },
      handshakeTimeout: timeoutMs,
      perMessageDeflate: true,
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('edge connect timeout'));
    }, timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function configMsg() {
  return (
    `X-Timestamp:${jsDate()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    '{"context":{"synthesis":{"audio":{"metadataoptions":{' +
    '"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"' +
    '},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
  );
}

export async function synthesizeEdgeChunk(text, voice, rate = '+0%', pitch = '+0Hz', attempt = 0) {
  let ws;
  try {
    ws = await openSocket();
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(350 * (attempt + 1) * (attempt + 1));
    return synthesizeEdgeChunk(text, voice, rate, pitch, attempt + 1);
  }

  const chunks = [];
  let gotAudio = false;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          ws.terminate();
        } catch {
          undefined;
        }
        reject(new Error('edge synthesis timeout'));
      }, 90000);

      const finish = (err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };

      let settled = false;
      const finishOnce = (err) => {
        if (settled) return;
        settled = true;
        finish(err);
      };

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          if (buf.length < 2) return;
          const headerLength = buf.readUInt16BE(0);
          if (headerLength + 2 > buf.length) return;
          const headers = parseHeaders(buf.subarray(2, 2 + headerLength), headerLength);
          if (headers.get('Path') !== 'audio') return;
          const contentType = headers.get('Content-Type');
          const payload = buf.subarray(2 + headerLength);
          if (contentType === 'audio/mpeg' && payload.length) {
            chunks.push(payload);
            gotAudio = true;
          }
          return;
        }
        const raw = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        const split = raw.indexOf('\r\n\r\n');
        if (split < 0) return;
        const headers = parseHeaders(raw, split);
        if (headers.get('Path') === 'turn.end') finishOnce();
      });

      ws.on('error', (err) => finishOnce(err));
      ws.on('close', () => {
        if (gotAudio) finishOnce();
        else finishOnce(new Error('edge socket closed'));
      });

      ws.send(configMsg());
      ws.send(
        `X-RequestId:${connectId()}\r\n` +
          'Content-Type:application/ssml+xml\r\n' +
          `X-Timestamp:${jsDate()}Z\r\n` +
          'Path:ssml\r\n\r\n' +
          makeSsml(voice, text, rate, pitch)
      );
    });
  } catch (err) {
    try {
      ws.terminate();
    } catch {
      undefined;
    }
    if (attempt >= 4) throw err;
    await sleep(350 * (attempt + 1) * (attempt + 1));
    return synthesizeEdgeChunk(text, voice, rate, pitch, attempt + 1);
  } finally {
    try {
      ws.close();
    } catch {
      undefined;
    }
  }

  if (!gotAudio) throw new Error('no audio from edge');
  return Buffer.concat(chunks);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
