import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  console.log(`🔄 Proxying request: ${req.method} ${req.url}`);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Proxy to Vite dev server
  proxy.web(req, res, {
    target: 'http://localhost:5173',
    changeOrigin: true,
  });
});

server.on('error', (err) => {
  console.error('❌ Proxy server error:', err);
});

server.listen(8000, () => {
  console.log('🚀 Simple reverse proxy running on http://localhost:8000');
  console.log('📡 Proxying all requests to http://localhost:5173');
});
