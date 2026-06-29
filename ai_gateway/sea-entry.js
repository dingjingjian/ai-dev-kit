'use strict';

// SEA entry point — imports static files as strings via esbuild text loader
// and serves them from memory instead of filesystem.

const express = require('express');
const path = require('path');
const { exec } = require('child_process');

// Static assets — esbuild inlines these as strings during build
const indexHtml = require('./public/index.html');
const styleCss = require('./public/style.css');
const appJs = require('./public/app.js');

const {
  initConfig,
  getProviders,
  getProvider,
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  getGatewayConfig,
  updateGatewayConfig,
  getLogs,
  clearLogs,
  getActiveProvider,
} = require('./src/config');
const { proxyChatCompletion, proxyListModels, testProvider } = require('./src/proxy');

initConfig();

const config = getGatewayConfig();
const PORT = process.env.PORT || config.port || 5174;
const GATEWAY_KEY = config.apiKey;

const app = express();
app.use(express.json({ limit: '10mb' }));

// In-memory static file serving (for SEA mode)
const staticFiles = {
  '/': indexHtml,
  '/index.html': indexHtml,
  '/style.css': styleCss,
  '/app.js': appJs,
};

app.use((req, res, next) => {
  const file = staticFiles[req.path];
  if (file) {
    const ext = path.extname(req.path);
    const types = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
    };
    res.setHeader('Content-Type', types[ext] || 'text/html');
    return res.send(file);
  }
  next();
});

// --- Auth middleware ---
function mgmtAuth(req, res, next) {
  const auth = req.headers.authorization;
  const remoteIp = req.ip || req.socket.remoteAddress || '';
  if (remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1') {
    return next();
  }
  if (auth === 'Bearer ' + GATEWAY_KEY) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function proxyAuth(req, res, next) {
  next();
}

app.post('/v1/chat/completions', proxyAuth, proxyChatCompletion);
app.get('/v1/models', proxyAuth, proxyListModels);

// --- Management API ---
app.get('/api/providers', mgmtAuth, (req, res) => {
  res.json({ providers: getProviders(), activeProviderId: getGatewayConfig().activeProviderId });
});

app.post('/api/providers', mgmtAuth, (req, res) => {
  try {
    res.status(201).json(addProvider(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/providers/:id', mgmtAuth, (req, res) => {
  const updated = updateProvider(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Provider not found' });
  res.json(updated);
});

app.delete('/api/providers/:id', mgmtAuth, (req, res) => {
  if (!deleteProvider(req.params.id)) return res.status(404).json({ error: 'Provider not found' });
  res.json({ success: true });
});

app.put('/api/providers/:id/activate', mgmtAuth, (req, res) => {
  if (!setActiveProvider(req.params.id)) return res.status(404).json({ error: 'Provider not found' });
  res.json({ success: true, activeProviderId: req.params.id });
});

app.post('/api/providers/:id/test', mgmtAuth, async (req, res) => {
  const provider = getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  try {
    res.json(await testProvider(provider));
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/config', mgmtAuth, (req, res) => res.json(getGatewayConfig()));
app.put('/api/config', mgmtAuth, (req, res) => res.json(updateGatewayConfig(req.body)));
app.get('/api/logs', mgmtAuth, (req, res) => res.json(getLogs(parseInt(req.query.limit) || 50)));
app.delete('/api/logs', mgmtAuth, (req, res) => { clearLogs(); res.json({ success: true }); });
app.get('/api/active', mgmtAuth, (req, res) => res.json({ provider: getActiveProvider() }));

// SPA fallback
app.get('*', (req, res) => res.send(indexHtml));

app.listen(PORT, () => {
  const gw = getGatewayConfig();
  console.log('');
  console.log('  ===========================================');
  console.log('           AI Gateway  v1.0.0');
  console.log('  ===========================================');
  console.log('  Management UI:  http://localhost:' + PORT);
  console.log('  Proxy Endpoint: http://localhost:' + PORT + '/v1');
  console.log('  Gateway Key:    ' + gw.apiKey.slice(0, 20) + '...');
  console.log('  ===========================================');
  console.log('');

  // Auto-open browser
  const url = 'http://localhost:' + PORT;
  const cmd = process.platform === 'win32' ? 'start ""' : 'open';
  exec(cmd + ' "' + url + '"', () => {});
});
