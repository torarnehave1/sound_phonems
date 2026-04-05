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
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private recordingMixer: GainNode | null = null;
  private isConnected = false;

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
  }) {
    try {
      this.session = await this.ai.live.connect({
        model: settings.model || "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
            // Handle model text output (direct or transcription)
            if (message.serverContent?.modelTurn?.parts) {
              const parts = message.serverContent.modelTurn.parts;
              
              // Filter out parts that are explicitly marked as thoughts/thinking
              // or parts that look like internal reasoning if they come alongside a response
              const textParts = parts.filter(p => p.text && !(p as any).thought);
              
              for (const part of textParts) {
                if (part.text) {
                  // Heuristic: If the text starts with common "thinking" markers and is long, 
                  // it might be a thinking part that wasn't correctly tagged.
                  const isLikelyThinking = part.text.length > 50 && 
                    (part.text.startsWith("I'm pondering") || 
                     part.text.startsWith("Reflecting on") || 
                     part.text.startsWith("Thinking about"));
                  
                  if (!isLikelyThinking) {
                    callbacks.onMessage(part.text, false);
                  }
                }
              }

              const audioPart = parts.find(p => p.inlineData);
              if (audioPart?.inlineData?.data) {
                this.playAudio(audioPart.inlineData.data);
              }
            }

            // Handle user transcription
            const userTurn = (message.serverContent as any)?.userTurn;
            if (userTurn?.parts) {
              const textPart = userTurn.parts.find((p: any) => p.text);
              if (textPart?.text) {
                callbacks.onMessage(textPart.text, true);
              }
            }
            
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
    return this.recordingDestination ? this.recordingDestination.stream : this.stream;
  }

  private async startMic() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Create a destination for recording that combines mic and AI audio
      this.recordingDestination = this.audioContext.createMediaStreamDestination();
      this.recordingMixer = this.audioContext.createGain();
      this.recordingMixer.gain.value = 1.0;
      this.recordingMixer.connect(this.recordingDestination);

      // Note: In a real app, we'd use a worklet for better performance.
      const source = this.audioContext.createMediaStreamSource(this.stream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      
      // Connect mic to recording mixer
      const micRecordingGain = this.audioContext.createGain();
      micRecordingGain.gain.value = 1.0;
      source.connect(micRecordingGain);
      micRecordingGain.connect(this.recordingMixer);
      
      // Connect processor to destination via silent gain to keep it alive
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

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

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

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
    source.connect(this.audioContext.destination);
    
    // Connect AI audio to recording mixer if it exists
    if (this.recordingMixer) {
      const aiRecordingGain = this.audioContext.createGain();
      aiRecordingGain.gain.value = 1.0;
      source.connect(aiRecordingGain);
      aiRecordingGain.connect(this.recordingMixer);
    }

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
