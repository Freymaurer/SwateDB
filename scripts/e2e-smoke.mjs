const defaultTargets = {
  healthUrl: process.env.SMOKE_HEALTH_URL ?? 'http://localhost:3000/health',
  artefactsUrl:
    process.env.SMOKE_ARTEFACTS_URL ??
    'http://localhost:3000/artefacts?format=jsonld&page=1&pagesize=1',
  frontendUrl: process.env.SMOKE_FRONTEND_URL ?? 'http://localhost:8080/',
  timeoutMs: Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? '15000', 10),
};

const timeoutMs = Number.isFinite(defaultTargets.timeoutMs)
  ? Math.max(defaultTargets.timeoutMs, 1000)
  : 15000;

await runSmoke();

async function runSmoke() {
  console.log('[smoke] Starting end-to-end smoke checks');
  console.log(`[smoke] Health URL: ${defaultTargets.healthUrl}`);
  console.log(`[smoke] Artefacts URL: ${defaultTargets.artefactsUrl}`);
  console.log(`[smoke] Frontend URL: ${defaultTargets.frontendUrl}`);

  const health = await fetchJson(defaultTargets.healthUrl, {
    expectedStatus: 200,
    name: 'backend health',
  });

  if (health.status !== 'ok') {
    throw new Error(
      `[smoke] backend health returned status=${String(
        health.status,
      )}. Expected \"ok\" with healthy dependencies.`,
    );
  }

  const artefacts = await fetchJson(defaultTargets.artefactsUrl, {
    expectedStatus: 200,
    name: 'artefacts collection',
  });

  const totalItemsRaw = artefacts.totalItems;
  const hasHydraType = artefacts['@type'] === 'hydra:Collection';
  if (!hasHydraType || typeof totalItemsRaw !== 'number') {
    throw new Error(
      '[smoke] artefacts response shape mismatch. Expected hydra:Collection with numeric totalItems.',
    );
  }

  const frontendHtml = await fetchText(defaultTargets.frontendUrl, {
    expectedStatus: 200,
    name: 'frontend',
  });

  if (!frontendHtml.includes('<title>') || !frontendHtml.toLowerCase().includes('swatedb')) {
    throw new Error(
      '[smoke] frontend HTML does not look like SwateDB app shell (missing title marker).',
    );
  }

  console.log('[smoke] backend health: ok');
  console.log(`[smoke] artefacts totalItems: ${totalItemsRaw}`);
  console.log('[smoke] frontend reachability: ok');
  console.log('[smoke] All smoke checks passed');
}

async function fetchJson(url, options) {
  const response = await fetchWithTimeout(url, options);
  const bodyText = await response.text();

  if (response.status !== options.expectedStatus) {
    throw new Error(
      `[smoke] ${options.name} expected HTTP ${options.expectedStatus}, got HTTP ${response.status}. Body: ${trimBody(
        bodyText,
      )}`,
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[smoke] ${options.name} did not return valid JSON: ${detail}`);
  }
}

async function fetchText(url, options) {
  const response = await fetchWithTimeout(url, options);
  const bodyText = await response.text();

  if (response.status !== options.expectedStatus) {
    throw new Error(
      `[smoke] ${options.name} expected HTTP ${options.expectedStatus}, got HTTP ${response.status}. Body: ${trimBody(
        bodyText,
      )}`,
    );
  }

  return bodyText;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`[smoke] ${options.name} timed out after ${timeoutMs}ms: ${url}`);
    }

    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[smoke] ${options.name} request failed for ${url}: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

function trimBody(value) {
  const normalized = typeof value === 'string' ? value : String(value);
  if (normalized.length <= 300) {
    return normalized;
  }

  return `${normalized.slice(0, 297)}...`;
}
