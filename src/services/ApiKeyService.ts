const GEMINI_WORKER_URL = 'https://gemini.vegvisr.org';

interface LiveConfig {
  apiKey: string;
  model: string;
}

let cachedConfig: LiveConfig | null = null;
let cacheExpiry = 0;

export async function fetchLiveConfig(userId?: string): Promise<LiveConfig> {
  if (cachedConfig && Date.now() < cacheExpiry) {
    return cachedConfig;
  }

  const res = await fetch(`${GEMINI_WORKER_URL}/live-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: userId || 'anonymous' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Failed to fetch config (${res.status})`);
  }

  const config: LiveConfig = await res.json();
  cachedConfig = config;
  cacheExpiry = Date.now() + 3600_000; // cache 1 hour
  return config;
}

export function clearCachedConfig() {
  cachedConfig = null;
  cacheExpiry = 0;
}
