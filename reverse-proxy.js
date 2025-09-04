import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

// Proxy API requests to the Vite dev server (must come before static file serving)
app.use('/diy/api', createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔄 Proxying API request: ${req.method} ${req.url} → http://localhost:5173${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy error for ${req.url}:`, err.message);
  }
}));

// Serve static files from the public directory at /diy/ path
app.use('/diy', express.static(path.join(__dirname, 'public')));

// Proxy all other requests to the Vite dev server
app.use('/diy', createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`🔄 Proxying request: ${req.method} ${req.url} → http://localhost:5173${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy error for ${req.url}:`, err.message);
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Reverse proxy is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Reverse proxy running on http://localhost:${PORT}`);
  console.log(`📡 Proxying /diy/* to http://localhost:5173/diy/*`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});
