const UPLOAD_URL = 'https://norwegian-transcription-worker.torarnehave.workers.dev/upload';
const PORTFOLIO_URL = 'https://audio-portfolio-worker.torarnehave.workers.dev';

function getStoredUser(): { email: string; user_id?: string | null } | null {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

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
  const user = getStoredUser();
  const userId = user?.user_id || user?.email || null;

  if (!transcript || transcript.trim().length < 10) {
    return { 
      title: 'Brief Interaction', 
      summary: 'The conversation was too short to generate a detailed summary.', 
      keywords: ['sonic-wisdom', 'short'] 
    };
  }

  try {
    const res = await fetch('https://gemini.vegvisr.org/gemini-2.0-flash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        messages: [{
          role: 'user',
          content: `Analyze this conversation transcript and return a JSON object with:
- "title": a short descriptive title (max 10 words)
- "summary": a 2-3 sentence summary of what was discussed
- "keywords": an array of 3-7 relevant keywords

Transcript:
${transcript.slice(0, 5000)}

Return ONLY valid JSON. If the transcript is in another language, provide the summary in that language but keep the JSON keys as "title", "summary", and "keywords".`
        }]
      }),
    });
    if (!res.ok) throw new Error(`Gemini analyze failed: ${res.status}`);
    const data = await res.json() as any;
    let text = data.choices?.[0]?.message?.content || data.response || '';
    
    // Clean up response if it has markdown fencing
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      const parts = text.split('```');
      if (parts.length >= 3) {
        text = parts[1].trim();
      }
    }

    try {
      const parsed = JSON.parse(text);
      return {
        title: parsed.title || 'Sonic Wisdom Conversation',
        summary: parsed.summary || transcript.slice(0, 300),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : ['sonic-wisdom']
      };
    } catch (parseErr) {
      console.warn("Failed to parse Gemini JSON, using raw text fallback", parseErr);
      return {
        title: 'Sonic Wisdom Conversation',
        summary: text.slice(0, 500) || transcript.slice(0, 300),
        keywords: ['sonic-wisdom']
      };
    }
  } catch (err) {
    console.error("Metadata generation error:", err);
    return { 
      title: 'Sonic Wisdom Conversation', 
      summary: transcript.slice(0, 300) + (transcript.length > 300 ? '...' : ''), 
      keywords: ['sonic-wisdom'] 
    };
  }
}

async function saveToPortfolio(params: {
  r2Key: string; r2Url: string; fileName: string;
  duration: number; fileSize: number;
  title: string; summary: string; keywords: string[];
  category: string;
}): Promise<{ recordingId: string; success: boolean }> {
  const user = getStoredUser();
  const userEmail = user?.email || 'sonic-wisdom@vegvisr.org';

  const res = await fetch(`${PORTFOLIO_URL}/save-recording`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Email': userEmail,
    },
    body: JSON.stringify({
      userEmail,
      fileName: params.fileName,
      displayName: params.title,
      r2Key: params.r2Key,
      r2Url: params.r2Url,
      fileSize: params.fileSize,
      duration: params.duration,
      transcriptionText: params.summary,
      tags: params.keywords,
      category: params.category,
      audioFormat: 'webm',
      sampleRate: 48000,
      aiService: 'gemini',
      aiModel: 'gemini-2.0-flash',
    }),
  });
  if (!res.ok) throw new Error(`Portfolio save failed: ${res.status}`);
  return res.json();
}

export async function saveConversation(blob: Blob, duration: number, transcript: string, category: string = 'Sonic Wisdom'): Promise<{ recordingId: string }> {
  const fileName = `sonic-wisdom-${Date.now()}.webm`;

  const { r2Key, audioUrl } = await uploadAudioToR2(blob, fileName);
  const { title, summary, keywords } = await generateMetadata(transcript);

  const result = await saveToPortfolio({
    r2Key,
    r2Url: audioUrl,
    fileName,
    duration,
    fileSize: blob.size,
    title,
    summary,
    keywords,
    category,
  });

  return { recordingId: result.recordingId };
}
