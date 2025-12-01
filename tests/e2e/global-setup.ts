import { FullConfig } from '@playwright/test';
import http from 'node:http';
import { spawn } from 'node:child_process';

function ping(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitFor(url: string, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    if (await ping(url)) return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

let uiProc: ReturnType<typeof spawn> | null = null;

async function startUI() {
  uiProc = spawn('npm', ['run', 'start'], { stdio: 'ignore', shell: true });
}

async function globalSetup(config: FullConfig) {
  const uiBase = (process.env.UI_BASE_URL || 'http://localhost:3000').replace(/\/+$/,'');
  const ok = await waitFor(uiBase, 15, 1000);
  if (!ok) {
    await startUI();
    const ready = await waitFor(uiBase, 30, 1000);
    if (!ready) {
      throw new Error(`UI not reachable at ${uiBase}`);
    }
  }
}

export default globalSetup;
