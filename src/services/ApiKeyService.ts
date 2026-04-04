/**
 * Service to manage API key and model configuration for Gemini Live.
 * Fetches the key from the Vegvisr gemini-worker using the logged-in user's credentials.
 */
export async function fetchLiveConfig() {
  const stored = localStorage.getItem('user');
  const user = stored ? JSON.parse(stored) : null;
  const userId = user?.user_id || user?.email || null;

  const res = await fetch('https://gemini.vegvisr.org/live-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || 'Failed to fetch live config');
  }

  const data = await res.json() as { apiKey: string; model: string };
  return data;
}
