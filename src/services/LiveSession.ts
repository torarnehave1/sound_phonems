import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

export type MessagePart = {
  text?: string;
  isUser: boolean;
};

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private isConnected = false;
  private speechRate = 1.0;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect(callbacks: {
    onMessage: (text: string, isUser: boolean) => void;
    onInterrupted: () => void;
    onError: (err: any) => void;
    onClose: () => void;
  }, settings: {
    voice: string;
    temperature: number;
    model?: string;
    systemInstruction?: string;
    speechRate?: number;
  }) {
    this.speechRate = settings.speechRate || 1.0;
    try {
      this.session = await this.ai.live.connect({
        model: settings.model || "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } },
          },
          temperature: settings.temperature,
          systemInstruction: settings.systemInstruction || `You are an expert in linguistics, phonemes, and ancient sound traditions. 
          Your knowledge spans Norse culture (Galdr), Vedic culture (Mantras), Sufism (Dhikr), Taoism (Healing Sounds), and the cross-cultural significance of sound.
          Engage in deep, atmospheric conversations about how sound shapes reality and culture. 
          Keep responses concise but profound. Use the user's voice input to guide the exploration.`,
        },
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle model text output
            if (message.serverContent?.modelTurn?.parts) {
              const textPart = message.serverContent.modelTurn.parts.find(p => p.text);
              if (textPart?.text) {
                callbacks.onMessage(textPart.text, false);
              }

              const audioPart = message.serverContent.modelTurn.parts.find(p => p.inlineData);
              if (audioPart?.inlineData?.data) {
                this.playAudio(audioPart.inlineData.data);
              }
            }

            // Handle transcriptions
            if (message.serverContent?.modelTurn?.parts) {
              // Some SDK versions might put transcription here
            }

            // The SDK might provide transcriptions in specific fields
            // For now, we'll assume the onMessage callback handles the role
            
            if (message.serverContent?.interrupted) {
              callbacks.onInterrupted();
              this.stopPlayback();
            }
          },
          onerror: (err) => {
            this.isConnected = false;
            callbacks.onError(err);
          },
          onclose: () => {
            this.isConnected = false;
            callbacks.onClose();
          },
        },
      });
    } catch (err) {
      callbacks.onError(err);
    }
  }

  sendText(text: string) {
    if (!this.session || !this.isConnected) return;
    
    try {
      this.session.sendRealtimeInput({
        text
      });
    } catch (err) {
      console.error("Error sending text to Live session:", err);
    }
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public getRecordingStream(): MediaStream | null {
    return this.stream;
  }

  private async startMic() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      // Note: In a real app, we'd use a worklet for better performance.
      // For this demo, we'll use a ScriptProcessor or similar if worklet isn't ready,
      // but standard practice is worklet. Let's assume we can use a simple processor.
      const source = this.audioContext.createMediaStreamSource(this.stream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.session) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Robust base64 encoding
        const uint8Array = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Data = btoa(binary);
        
        this.session.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };
    } catch (err) {
      console.error("Mic error:", err);
    }
  }

  private audioQueue: AudioBufferSourceNode[] = [];
  private nextStartTime = 0;

  private async playAudio(base64Data: string) {
    if (!this.audioContext) return;

    // Decode base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert PCM 16-bit to Float32
    // Use the buffer, offset, and length correctly
    const pcmData = new Int16Array(bytes.buffer, 0, bytes.length / 2);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }

    const sampleRate = 24000; // Gemini output is typically 24kHz
    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, sampleRate);
    audioBuffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = this.speechRate;
    source.connect(this.audioContext.destination);

    // Schedule playback for gapless audio
    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.02; // Reduced buffer for lower latency
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    
    this.audioQueue.push(source);
    
    // Cleanup finished sources
    source.onended = () => {
      this.audioQueue = this.audioQueue.filter(s => s !== source);
    };
  }

  private stopPlayback() {
    this.audioQueue.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.audioQueue = [];
    this.nextStartTime = 0;
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isConnected = false;
  }
}
