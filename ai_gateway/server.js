'use strict';

const express = require('express');
const path = require('path');
const { exec } = require('child_process');

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

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// --- Auth middleware for management API ---
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

// ============================================================
// OpenAI-compatible proxy endpoints
// ============================================================

function proxyAuth(req, res, next) {
  next();
}

app.post('/v1/chat/completions', proxyAuth, proxyChatCompletion);
app.get('/v1/models', proxyAuth, proxyListModels);

// Health check endpoint for testing connection
app.post('/v1', proxyAuth, (req, res) => {
  res.json({ status: 'ok', message: 'AI Gateway is running' });
});

// ============================================================
// Management API
// ============================================================

app.get('/api/providers', mgmtAuth, (req, res) => {
  const providers = getProviders();
  const activeId = getGatewayConfig().activeProviderId;
  res.json({ providers, activeProviderId: activeId });
});

app.post('/api/providers', mgmtAuth, (req, res) => {
  try {
    const provider = addProvider(req.body);
    res.status(201).json(provider);
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
  const ok = deleteProvider(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Provider not found' });
  res.json({ success: true });
});

app.put('/api/providers/:id/activate', mgmtAuth, (req, res) => {
  const ok = setActiveProvider(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Provider not found' });
  res.json({ success: true, activeProviderId: req.params.id });
});

app.post('/api/providers/:id/test', mgmtAuth, async (req, res) => {
  const provider = getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  try {
    const result = await testProvider(provider);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/config', mgmtAuth, (req, res) => {
  res.json(getGatewayConfig());
});

app.put('/api/config', mgmtAuth, (req, res) => {
  res.json(updateGatewayConfig(req.body));
});

app.get('/api/logs', mgmtAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getLogs(limit));
});

app.delete('/api/logs', mgmtAuth, (req, res) => {
  clearLogs();
  res.json({ success: true });
});

app.get('/api/active', mgmtAuth, (req, res) => {
  res.json({ provider: getActiveProvider() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
