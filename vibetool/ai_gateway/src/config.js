'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID, randomBytes } = require('crypto');

// Detect standalone (SEA) mode:
// SEA: process.argv[1] equals process.execPath (the exe path itself)
// Dev: process.argv[1] is the script path (e.g. 'server.js')
const isStandalone = !process.argv[1] || process.argv[1] === process.execPath;
const ROOT_DIR = isStandalone ? path.dirname(process.execPath) : path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  gateway: {
    port: 5174,
    apiKey: 'gw-' + randomBytes(16).toString('hex'),
    activeProviderId: null,
  },
  providers: [],
  logs: [],
};

// Ensure data directory and config file exist
function initConfig() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    writeConfig(DEFAULT_CONFIG);
  }
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(raw);
    return {
      gateway: { ...DEFAULT_CONFIG.gateway, ...config.gateway },
      providers: config.providers || [],
      logs: config.logs || [],
    };
  } catch {
    writeConfig(DEFAULT_CONFIG);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// --- Provider CRUD ---

function getProviders() {
  return readConfig().providers;
}

function getProvider(id) {
  return readConfig().providers.find((p) => p.id === id);
}

function getActiveProvider() {
  const config = readConfig();
  if (!config.gateway.activeProviderId) return null;
  return config.providers.find((p) => p.id === config.gateway.activeProviderId) || null;
}

function addProvider(data) {
  const config = readConfig();
  const provider = {
    id: randomUUID(),
    name: (data.name || '').trim() || 'Unnamed',
    baseUrl: ((data.baseUrl || '').trim() || '').replace(/\/+$/, ''),
    apiKey: (data.apiKey || '').trim() || '',
    modelId: (data.modelId || '').trim() || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  config.providers.push(provider);
  if (!config.gateway.activeProviderId) {
    config.gateway.activeProviderId = provider.id;
  }
  writeConfig(config);
  return provider;
}

function updateProvider(id, data) {
  const config = readConfig();
  const idx = config.providers.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated = {
    ...config.providers[idx],
    name: (data.name || '').trim() || config.providers[idx].name,
    baseUrl: ((data.baseUrl || '').trim() || config.providers[idx].baseUrl).replace(/\/+$/, ''),
    apiKey: data.apiKey !== undefined ? data.apiKey.trim() : config.providers[idx].apiKey,
    modelId: (data.modelId || '').trim() || config.providers[idx].modelId,
    updatedAt: new Date().toISOString(),
  };
  config.providers[idx] = updated;
  writeConfig(config);
  return updated;
}

function deleteProvider(id) {
  const config = readConfig();
  const before = config.providers.length;
  config.providers = config.providers.filter((p) => p.id !== id);
  if (config.gateway.activeProviderId === id) {
    config.gateway.activeProviderId = config.providers[0]?.id || null;
  }
  writeConfig(config);
  return config.providers.length < before;
}

function setActiveProvider(id) {
  const config = readConfig();
  if (!config.providers.find((p) => p.id === id)) return false;
  config.gateway.activeProviderId = id;
  writeConfig(config);
  return true;
}

// --- Gateway config ---

function getGatewayConfig() {
  return readConfig().gateway;
}

function updateGatewayConfig(data) {
  const config = readConfig();
  if (data.port !== undefined) config.gateway.port = data.port;
  if (data.apiKey !== undefined) config.gateway.apiKey = data.apiKey;
  writeConfig(config);
  return config.gateway;
}

// --- Logs ---

function addLog(entry) {
  const config = readConfig();
  config.logs.unshift({ ...entry, id: randomUUID() });
  if (config.logs.length > 200) config.logs = config.logs.slice(0, 200);
  writeConfig(config);
}

function getLogs(limit) {
  limit = limit || 50;
  return readConfig().logs.slice(0, limit);
}

function clearLogs() {
  const config = readConfig();
  config.logs = [];
  writeConfig(config);
}

module.exports = {
  initConfig,
  readConfig,
  writeConfig,
  getProviders,
  getProvider,
  getActiveProvider,
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  getGatewayConfig,
  updateGatewayConfig,
  addLog,
  getLogs,
  clearLogs,
};
