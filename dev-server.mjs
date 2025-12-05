import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WORKER_ORIGIN = process.env.WORKER_ORIGIN || 'http://localhost:8787';

// Static files from repo root (index.html, style.css, script.js, assets, login/register pages)
app.use(express.static(__dirname));

// Proxy API calls to Cloudflare Worker dev server
app.use(
  '/api',
  createProxyMiddleware({
    target: WORKER_ORIGIN,
    changeOrigin: true,
    xfwd: true,
    pathRewrite: (path) => path, // keep /api/* as-is
    logLevel: 'silent',
  })
);

app.listen(PORT, () => {
  console.log(`Local dev server running at http://localhost:${PORT}`);
  console.log(`Proxying /api to ${WORKER_ORIGIN}`);
});
