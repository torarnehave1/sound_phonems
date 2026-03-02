const UPLOAD_URL = 'https://norwegian-transcription-worker.torarnehave.workers.dev/upload';
const PORTFOLIO_URL = 'https://audio-portfolio-worker.torarnehave.workers.dev';
const AI_ANALYZE_URL = 'https://api.vegvisr.org/ai-analyze';
const USER_EMAIL = 'sonic-wisdom@vegvisr.org';

export class ConversationRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;

  start(stream: MediaStream) {
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startTime = Date.now();
  }

  stop(): Promise<{ blob: Blob; duration: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('Not recording'));
        return;
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType || 'audio/webm' });
        const duration = Math.round((Date.now() - this.startTime) / 1000);
        this.chunks = [];
        this.mediaRecorder = null;
        resolve({ blob, duration });
      };
      this.mediaRecorder.stop();
    });
  }

  recording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

async function uploadAudioToR2(blob: Blob, fileName: string): Promise<{ r2Key: string; audioUrl: string }> {
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'X-File-Name': encodeURIComponent(fileName) },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

async function generateMetadata(transcript: string): Promise<{ title: string; summary: string; keywords: string[] }> {
  const res = await fetch(AI_ANALYZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `Analyze this conversation transcript and return a JSON object with:
- "title": a short descriptive title (max 10 words)
- "summary": a 2-3 sentence summary of what was discussed
- "keywords": an array of 3-7 relevant keywords

Transcript:
${transcript.slice(0, 3000)}

Return ONLY valid JSON, no markdown fencing.`
    }),
  });
  if (!res.ok) throw new Error(`AI analyze failed: ${res.status}`);
  const data = await res.json();
  try {
    return JSON.parse(data.response);
  } catch {
    return { title: 'Sonic Wisdom Conversation', summary: transcript.slice(0, 200), keywords: ['sonic-wisdom'] };
  }
}

async function saveToPortfolio(params: {
  r2Key: string; r2Url: string; fileName: string;
  duration: number; fileSize: number;
  title: string; summary: string; keywords: string[];
}): Promise<{ recordingId: string; success: boolean }> {
  const res = await fetch(`${PORTFOLIO_URL}/save-recording`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Email': USER_EMAIL,
    },
    body: JSON.stringify({
      userEmail: USER_EMAIL,
      fileName: params.fileName,
      displayName: params.title,
      r2Key: params.r2Key,
      r2Url: params.r2Url,
      fileSize: params.fileSize,
      duration: params.duration,
      transcriptionText: params.summary,
      tags: params.keywords,
      category: 'Sonic Wisdom',
      audioFormat: 'webm',
      sampleRate: 48000,
      aiService: 'cloudflare-ai',
      aiModel: '@cf/meta/llama-3.1-8b-instruct',
    }),
  });
  if (!res.ok) throw new Error(`Portfolio save failed: ${res.status}`);
  return res.json();
}

export async function saveConversation(blob: Blob, duration: number, transcript: string): Promise<{ recordingId: string }> {
  const fileName = `sonic-wisdom-${Date.now()}.webm`;

  // Upload audio to R2
  const { r2Key, audioUrl } = await uploadAudioToR2(blob, fileName);

  // Generate AI metadata from transcript
  const { title, summary, keywords } = await generateMetadata(transcript);

  // Save metadata to audio-portfolio
  const result = await saveToPortfolio({
    r2Key,
    r2Url: audioUrl,
    fileName,
    duration,
    fileSize: blob.size,
    title,
    summary,
    keywords,
  });

  return { recordingId: result.recordingId };
}
