/**
 * Service to manage API key and model configuration for Gemini Live.
 */
export async function fetchLiveConfig() {
  // In this environment, the API key is provided via process.env.GEMINI_API_KEY
  // or can be selected via window.aistudio if missing.
  
  let apiKey = process.env.GEMINI_API_KEY || (process as any).env.API_KEY;

  if (!apiKey && typeof window !== 'undefined' && (window as any).aistudio) {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await (window as any).aistudio.openSelectKey();
    }
    // After selection, the key should be available in the environment
    apiKey = process.env.GEMINI_API_KEY || (process as any).env.API_KEY;
  }

  if (!apiKey) {
    throw new Error("API Key missing. Please configure it in the Secrets panel.");
  }

  return {
    apiKey,
    model: "gemini-3.1-flash-live-preview"
  };
}
