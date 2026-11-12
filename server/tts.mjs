import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, appendFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PUBLIC_VOICES, resolveVoice } from './voices.mjs';
import { synthesizeEdgeChunk } from './edgeTts.mjs';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.TTS_PORT || 3001);
const IS_WINDOWS = platform() === 'win32';
const CHUNK_CHARS = 180;
const POOL = 8;
const jobs = new Map();

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks, size).toString('utf8')));
    req.on('error', reject);
  });
}

function countWords(text) {
  let words = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const space = text.charCodeAt(i) <= 32;
    if (space) inWord = false;
    else if (!inWord) {
      words += 1;
      inWord = true;
    }
  }
  return words;
}

function chunkText(text, maxChars = CHUNK_CHARS) {
  const parts = [];
  let current = '';
  const push = () => {
    const value = current.trim();
    if (value) parts.push(value);
    current = '';
  };

  const tokens = String(text).replace(/\r\n/g, '\n').split(/(\s+)/);
  for (const token of tokens) {
    if (!token) continue;
    if (token.length > maxChars) {
      push();
      for (let i = 0; i < token.length; i += maxChars) {
        parts.push(token.slice(i, i + maxChars));
      }
      continue;
    }
    if ((current + token).length > maxChars && current.trim()) push();
    current += token;
  }
  push();
  return parts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: '*/*',
          Referer: 'https://translate.google.com/',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          httpsGetBuffer(res.headers.location).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (!res.statusCode || res.statusCode >= 400 || buf.length < 100) {
            reject(new Error(`tts http ${res.statusCode || 0}`));
            return;
          }
          resolve(buf);
        });
      }
    );
    req.setTimeout(45000, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function fetchGoogleChunk(text, lang, attempt = 0) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
    lang
  )}&q=${encodeURIComponent(text)}`;
  try {
    return await httpsGetBuffer(url);
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(400 * (attempt + 1) * (attempt + 1));
    return fetchGoogleChunk(text, lang, attempt + 1);
  }
}

async function mapPool(count, limit, worker) {
  let index = 0;
  const run = async () => {
    while (index < count) {
      const current = index;
      index += 1;
      await worker(current);
    }
  };
  const size = Math.max(1, Math.min(limit, count));
  await Promise.all(Array.from({ length: size }, run));
}

function rateToSapi(rate) {
  const raw = String(rate || '+0%');
  const match = raw.match(/^([+-]?\d+)%$/);
  const n = match ? 1 + Number(match[1]) / 100 : Number(rate);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-10, Math.min(10, Math.round((n - 1) * 10)));
}

function normalizeRate(rate) {
  const raw = String(rate || '+0%').trim();
  if (/^[+-]?\d+%$/.test(raw)) return raw.startsWith('+') || raw.startsWith('-') ? raw : `+${raw}`;
  return '+0%';
}

function normalizePitch(pitch) {
  const raw = String(pitch || '+0Hz').trim();
  if (/^[+-]?\d+Hz$/.test(raw)) return raw.startsWith('+') || raw.startsWith('-') ? raw : `+${raw}`;
  return '+0Hz';
}

async function windowsSapiTts(text, voice, rate, outPath) {
  const id = randomUUID();
  const textPath = join(tmpdir(), `voicecraft-${id}.txt`);
  const psPath = join(tmpdir(), `voicecraft-${id}.ps1`);
  const locale = (voice.locale || 'en-US').replace('_', '-');
  const gender = /male/i.test(voice.gender || '') ? 'Male' : 'Female';
  const sapiRate = rateToSapi(rate);
  const safeTextPath = textPath.replace(/'/g, "''");
  const safeWavPath = outPath.replace(/'/g, "''");
  const wantedLocale = locale.replace(/'/g, "''");

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$ss = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $wanted = '${wantedLocale}'
  $gender = [System.Speech.Synthesis.VoiceGender]::${gender}
  $voices = @($ss.GetInstalledVoices() | Where-Object { $_.Enabled })
  $match = $voices | Where-Object { $_.VoiceInfo.Culture.Name -eq $wanted -and $_.VoiceInfo.Gender -eq $gender } | Select-Object -First 1
  if (-not $match) {
    $match = $voices | Where-Object { $_.VoiceInfo.Culture.Name -eq $wanted } | Select-Object -First 1
  }
  if (-not $match) {
    $prefix = $wanted.Split('-')[0]
    $match = $voices | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $prefix -and $_.VoiceInfo.Gender -eq $gender } | Select-Object -First 1
  }
  if (-not $match) {
    $prefix = $wanted.Split('-')[0]
    $match = $voices | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $prefix } | Select-Object -First 1
  }
  if ($match) { $ss.SelectVoice($match.VoiceInfo.Name) }
  $ss.Rate = ${sapiRate}
  $ss.Volume = 100
  $ss.SetOutputToWaveFile('${safeWavPath}')
  $ss.Speak([IO.File]::ReadAllText('${safeTextPath}', [Text.Encoding]::UTF8))
} finally {
  $ss.Dispose()
}
`;

  try {
    await writeFile(textPath, text, 'utf8');
    await writeFile(psPath, script, 'utf8');
    const wordCount = Math.max(1, countWords(text));
    const timeoutMs = Math.min(6 * 60 * 60 * 1000, Math.max(120000, Math.ceil((wordCount / 130) * 60 * 1000) + 60000));
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath],
      { windowsHide: true, timeout: timeoutMs }
    );
  } finally {
    await Promise.allSettled([unlink(textPath), unlink(psPath)]);
  }
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    done: job.done,
    total: job.total,
    percent: job.total ? Math.round((job.done / job.total) * 100) : 0,
    mime: job.mime,
    voice: job.voice || null,
    error: job.error || null,
  };
}

async function runParallelMp3(job, chunks, fetchOne) {
  const pending = new Map();
  let nextWrite = 0;
  let flushing = false;
  await writeFile(job.filePath, Buffer.alloc(0));

  const flushReady = async () => {
    if (flushing) return;
    flushing = true;
    try {
      while (pending.has(nextWrite)) {
        const piece = pending.get(nextWrite);
        pending.delete(nextWrite);
        await appendFile(job.filePath, piece);
        nextWrite += 1;
        job.done = nextWrite;
      }
    } finally {
      flushing = false;
      if (pending.has(nextWrite)) await flushReady();
    }
  };

  await mapPool(chunks.length, POOL, async (i) => {
    if (job.cancelled) return;
    const buf = await fetchOne(chunks[i], i);
    if (job.cancelled) return;
    pending.set(i, buf);
    await flushReady();
  });

  if (job.cancelled) {
    job.status = 'cancelled';
    return;
  }
  if (job.done !== chunks.length) {
    throw new Error('generation incomplete');
  }
  job.status = 'done';
}

async function startJob(body) {
  const text = String(body.text || '').trim();
  if (!text) {
    const err = new Error('text is required');
    err.status = 400;
    throw err;
  }

  const voice = resolveVoice(body.voice);
  const rate = normalizeRate(body.rate);
  const pitch = normalizePitch(body.pitch);
  const chunks = chunkText(text);
  const id = randomUUID();
  const filePath = join(tmpdir(), `voicecraft-${id}.bin`);
  const job = {
    id,
    status: 'running',
    done: 0,
    total: Math.max(1, chunks.length),
    mime: 'audio/mpeg',
    filePath,
    voice: voice.name,
    error: null,
    cancelled: false,
    createdAt: Date.now(),
  };
  jobs.set(id, job);

  setTimeout(() => {
    const current = jobs.get(id);
    if (!current) return;
    current.cancelled = true;
  }, 6 * 60 * 60 * 1000).unref?.();

  (async () => {
    try {
      try {
        await runParallelMp3(job, chunks, (chunk) =>
          synthesizeEdgeChunk(chunk, voice.edge, rate, pitch)
        );
        return;
      } catch (edgeErr) {
        if (job.cancelled) {
          job.status = 'cancelled';
          return;
        }
        console.warn('Edge TTS failed, Google fallback:', edgeErr.message);
        job.done = 0;
        job.mime = 'audio/mpeg';
        try {
          await runParallelMp3(job, chunks, (chunk) => fetchGoogleChunk(chunk, voice.lang || 'en'));
          return;
        } catch (googleErr) {
          if (job.cancelled) {
            job.status = 'cancelled';
            return;
          }
          if (!IS_WINDOWS) throw googleErr;
          console.warn('Google TTS failed, Windows SAPI fallback:', googleErr.message);
        }
      }

      job.mime = 'audio/wav';
      job.total = 100;
      job.done = 1;
      const words = Math.max(1, countWords(text));
      const estimatedMs = Math.max(8000, (words / 900) * 60 * 1000);
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (job.cancelled || job.status !== 'running') return;
        const pct = Math.min(99, Math.round(((Date.now() - startedAt) / estimatedMs) * 100));
        job.done = Math.max(job.done, pct);
      }, 500);
      try {
        await windowsSapiTts(text, voice, rate, filePath);
        job.done = 100;
        job.status = 'done';
      } finally {
        clearInterval(timer);
      }
    } catch (err) {
      if (job.cancelled) {
        job.status = 'cancelled';
        return;
      }
      job.status = 'error';
      job.error = err.message || 'generation failed';
      console.error('Generate failed:', job.error);
    }
  })();

  return job;
}

function cleanupJob(job) {
  if (!job) return;
  job.cancelled = true;
  if (job.filePath && existsSync(job.filePath)) {
    unlink(job.filePath).catch(() => undefined);
  }
  jobs.delete(job.id);
}

setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (now - job.createdAt > 2 * 60 * 60 * 1000) cleanupJob(job);
  }
}, 10 * 60 * 1000).unref?.();

function parseJsonBody(raw) {
  if (!raw) return {};
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, engine: 'edge-neural', windows: IS_WINDOWS });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/voices') {
      sendJson(res, 200, PUBLIC_VOICES);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = parseJsonBody(await readBody(req));
      const job = await startJob(body);
      sendJson(res, 200, publicJob(job));
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/generate/')) {
      const rest = url.pathname.slice('/api/generate/'.length);
      const [id, extra] = rest.split('/');
      const job = jobs.get(id);
      if (!job) {
        sendJson(res, 404, { error: 'job not found' });
        return;
      }
      if (extra === 'audio') {
        if (job.status !== 'done' || !existsSync(job.filePath)) {
          sendJson(res, 409, { error: 'audio not ready' });
          return;
        }
        const ext = job.mime.includes('wav') ? 'wav' : 'mp3';
        const st = statSync(job.filePath);
        res.writeHead(200, {
          'Content-Type': job.mime,
          'Content-Length': st.size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Content-Disposition': `inline; filename="voicecraft.${ext}"`,
        });
        createReadStream(job.filePath).pipe(res);
        return;
      }
      sendJson(res, 200, publicJob(job));
      return;
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/generate/')) {
      const id = url.pathname.slice('/api/generate/'.length).split('/')[0];
      const job = jobs.get(id);
      if (job) cleanupJob(job);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/tts') {
      const body = parseJsonBody(await readBody(req));
      const job = await startJob(body);
      const started = Date.now();
      while (job.status === 'running' && Date.now() - started < 6 * 60 * 60 * 1000) {
        await sleep(250);
      }
      if (job.status !== 'done') {
        sendJson(res, job.status === 'cancelled' ? 499 : 500, { error: job.error || 'generation failed' });
        return;
      }
      const ext = job.mime.includes('wav') ? 'wav' : 'mp3';
      const st = statSync(job.filePath);
      res.writeHead(200, {
        'Content-Type': job.mime,
        'Content-Length': st.size,
        'Content-Disposition': `inline; filename="voicecraft.${ext}"`,
      });
      createReadStream(job.filePath).pipe(res);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    const status = err.status || 500;
    sendJson(res, status, { error: err.message || 'tts failed' });
  }
});

server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`VoiceCraft TTS API running on http://127.0.0.1:${PORT}`);
});
