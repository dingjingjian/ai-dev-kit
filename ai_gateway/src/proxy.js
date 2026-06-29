'use strict';

const { getActiveProvider, addLog } = require('./config');

/**
 * Proxy a chat completion request to the active provider.
 * Supports both regular JSON and streaming (SSE) responses.
 */
async function proxyChatCompletion(req, res) {
  const provider = getActiveProvider();

  if (!provider) {
    return res.status(503).json({
      error: {
        message: 'No active provider configured. Please set one in the gateway UI.',
        type: 'gateway_error',
      },
    });
  }

  const targetUrl = provider.baseUrl + '/chat/completions';
  const isStream = req.body && req.body.stream === true;

  const requestBody = {
    ...req.body,
    model: provider.modelId,
  };

  const startTime = Date.now();
  let statusCode = 200;
  let errorDetail = null;

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + provider.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    statusCode = upstream.status;

    if (!upstream.ok) {
      const errText = await upstream.text();
      errorDetail = errText;
      res.status(upstream.status).type('application/json').send(errText);
      addLog({
        time: new Date().toISOString(),
        provider: provider.name,
        model: provider.modelId,
        status: upstream.status,
        duration: Date.now() - startTime,
        stream: isStream,
        error: (errText || '').slice(0, 500),
      });
      return;
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamErr) {
        errorDetail = streamErr.message;
      }
      res.end();
    } else {
      const data = await upstream.text();
      res.status(upstream.status).type('application/json').send(data);
    }

    addLog({
      time: new Date().toISOString(),
      provider: provider.name,
      model: provider.modelId,
      status: statusCode,
      duration: Date.now() - startTime,
      stream: isStream,
      error: errorDetail,
    });
  } catch (err) {
    errorDetail = err.message;
    res.status(502).json({
      error: {
        message: 'Gateway cannot reach provider: ' + err.message,
        type: 'gateway_error',
      },
    });
    addLog({
      time: new Date().toISOString(),
      provider: provider.name,
      model: provider.modelId,
      status: 502,
      duration: Date.now() - startTime,
      stream: isStream,
      error: err.message,
    });
  }
}

/**
 * Proxy GET /v1/models — return the active provider's model info.
 */
async function proxyListModels(req, res) {
  const provider = getActiveProvider();

  if (!provider) {
    return res.status(503).json({
      error: {
        message: 'No active provider configured.',
        type: 'gateway_error',
      },
    });
  }

  res.json({
    object: 'list',
    data: [
      {
        id: provider.modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: provider.name,
      },
    ],
  });
}

/**
 * Test a provider connection by sending a minimal request.
 */
async function testProvider(provider) {
  const targetUrl = provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const start = Date.now();

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + provider.apiKey,
    },
    body: JSON.stringify({
      model: provider.modelId,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
      stream: false,
    }),
  });

  const elapsed = Date.now() - start;

  if (!response.ok) {
    const errText = await response.text();
    return {
      success: false,
      status: response.status,
      latency: elapsed,
      error: errText.slice(0, 500),
    };
  }

  return {
    success: true,
    status: response.status,
    latency: elapsed,
  };
}

module.exports = { proxyChatCompletion, proxyListModels, testProvider };
