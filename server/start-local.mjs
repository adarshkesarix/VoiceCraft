import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = platform() === 'win32';
const API_PORT = Number(process.env.TTS_PORT || 3001);
const APP_PORT = Number(process.env.APP_PORT || 4173);
const children = [];

function waitForPort(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Port ${port} start nahi hua`));
          return;
        }
        setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function spawnNode(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`Process exit: ${args.join(' ')} -> ${code}`);
    }
  });
  return child;
}

function openBrowser(url) {
  if (IS_WINDOWS) {
    spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function stopAll() {
  for (const child of children) {
    if (!child.pid) continue;
    if (IS_WINDOWS) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) {
  console.error('node_modules missing. Pehle npm install chalao.');
  process.exit(1);
}

const distIndex = join(root, 'dist', 'index.html');
const usePreview = existsSync(distIndex);

console.log('VoiceCraft local start ho raha hai...');
spawnNode([join(root, 'server', 'tts.mjs')], { TTS_PORT: String(API_PORT) });

if (usePreview) {
  spawnNode([viteBin, 'preview', '--host', '127.0.0.1', '--port', String(APP_PORT)]);
} else {
  spawnNode([viteBin, '--host', '127.0.0.1', '--port', String(APP_PORT)]);
}

const appUrl = `http://127.0.0.1:${APP_PORT}`;

try {
  await waitForPort(API_PORT);
  await waitForPort(APP_PORT);
  console.log(`Ready: ${appUrl}`);
  openBrowser(appUrl);
} catch (err) {
  console.error(err.message || err);
  stopAll();
  process.exit(1);
}
