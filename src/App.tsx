import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Info, Sparkles, History, Circle, Square, Loader2, Download, Trash2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { LiveSessionManager } from './services/LiveSession';
import { fetchLiveConfig } from './services/ApiKeyService';
import { ConversationRecorder, saveConversation } from './services/RecordingService';
import { Visualizer } from './components/Visualizer';
import { AuthGate, UserBadge } from './auth/VegvisrAuth';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [session, setSession] = useState<LiveSessionManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);
  
  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const recorderRef = useRef<ConversationRecorder>(new ConversationRecorder());

  // Settings
  const [voice, setVoice] = useState<string>("Kore"); // Default to Female
  const [temperature, setTemperature] = useState<number>(0.7);
  const [conversationStyle, setConversationStyle] = useState<string>("sage");
  const [selectedTheme, setSelectedTheme] = useState<string>("sonic");
  const [customInstructions, setCustomInstructions] = useState<string>("");

  const THEMES: Record<string, { label: string; topics: string; context: string; description: string }> = {
    sonic: {
      label: "Sonic Wisdom",
      topics: "linguistics, phonemes, and ancient sound traditions (Norse Galdr, Vedic Mantras, Sufism, Taoism)",
      context: "Your knowledge spans the cross-cultural significance of sound and how it shapes reality.",
      description: "Explore the sacred phonemes of ancient traditions"
    },
    tech: {
      label: "Tech Explorer",
      topics: "technology, specifically Cloudflare Serverless, AI, LLM inference, and modern coding practices",
      context: "You are at the cutting edge of software architecture and artificial intelligence.",
      description: "Deep dive into serverless, AI, and modern code"
    },
    wellness: {
      label: "Holistic Wellness",
      topics: "trauma prevention, bioenergetics, yoga, and holistic body work",
      context: "You understand the deep connection between the body, mind, and nervous system.",
      description: "Journey through trauma prevention and body work"
    },
    knowledge: {
      label: "Knowledge Management",
      topics: "Organizational KM, SECI model (Nonaka & Takeuchi), KM cycles (Dalkir), knowledge flows (creation, retention, transfer, utilization), organizational learning, Communities of Practice (CoP), and AI-supported knowledge management (LLMs, semantic graphs)",
      context: "You are an expert in organizational knowledge creation and dynamics. You draw from classics like Nonaka & Takeuchi's 'The Knowledge-Creating Company' and Dalkir's 'Knowledge Management in Theory and Practice'. You navigate between organizational, ecological, and techno-centric schools of thought, emphasizing the 'creative organization' and the deep connection between knowledge, culture, and power.",
      description: "Master organizational innovation and knowledge cycles"
    },
    writing: {
      label: "Book Writing",
      topics: "creative writing, non-fiction structure, storytelling, and the publishing process",
      context: "You are a seasoned editor and writing coach, helping authors find their voice and bring their stories to life.",
      description: "Bring your stories to life with expert guidance"
    },
    cohesion: {
      label: "Cohesion",
      topics: "group cohesion, group dynamics, dimensions of cohesion (attractiveness, attraction, unity, teamwork), group development phases (Wheelan, Bion), and the relationship between cohesion, norms, and productivity",
      context: "You are an expert in group dynamics and cohesion. You understand the forces that bind groups together—emotional bonds, perceived unity, and coordinated effort. You draw from theorists like Festinger, Yalom, Wheelan, and Bion. You emphasize that true community is the presence of deeper listening and that cohesion must be balanced with healthy norms and clear goals.",
      description: "Explore the forces that bind groups together"
    }
  };

  const STYLES: Record<string, string> = {
    sage: `You are an expert in {{TOPICS}}. {{CONTEXT}} 
          Engage in deep, atmospheric conversations. 
          Keep responses concise but profound. Use the user's voice input to guide the exploration.`,
    interviewer: `You are a curious researcher interviewing the user about {{TOPICS}}. {{CONTEXT}} 
          Ask insightful questions to draw out the user's insights and research together. 
          Keep the tone professional yet inquisitive.`,
    podcast: `You are a co-host on a podcast about {{TOPICS}}. {{CONTEXT}} 
          Engage in a natural, back-and-forth dialogue with the user (your co-host). 
          Share expert insights while reacting naturally to the user's points. 
          The tone should be conversational, engaging, and fluid.`,
    custom: customInstructions
  };

  const getSystemInstruction = () => {
    if (conversationStyle === 'custom') return customInstructions;
    const theme = THEMES[selectedTheme];
    let instruction = STYLES[conversationStyle]
      .replace("{{TOPICS}}", theme.topics)
      .replace("{{CONTEXT}}", theme.context);

    return instruction;
  };

  const lastSpeakerRef = useRef<string | null>(null);

  const startSession = useCallback(async () => {
    try {
      setError(null);
      const config = await fetchLiveConfig();

      const newSession = new LiveSessionManager(config.apiKey);
      setSession(newSession);
      lastSpeakerRef.current = null;

      await newSession.connect({
        onMessage: (text, isUser) => {
          setTranscript(prev => {
            const speaker = isUser ? "You" : "Sonic Wisdom";
            if (lastSpeakerRef.current !== speaker) {
              lastSpeakerRef.current = speaker;
              const prefix = `\n\n**${speaker}:** `;
              return prev + prefix + text;
            }
            return prev + " " + text;
          });
        },
        onInterrupted: () => {
          // Keep transcript on interrupt
        },
        onError: (err) => {
          console.error(err);
          setError("Connection error. Please try again.");
          setIsConnected(false);
        },
        onClose: () => {
          setIsConnected(false);
        }
      }, {
        voice,
        temperature,
        model: config.model,
        systemInstruction: getSystemInstruction()
      });

      setIsConnected(true);
      setTranscript("");
    } catch (err: any) {
      setError(err.message || "Failed to initialize session.");
    }
  }, [voice, temperature, conversationStyle, selectedTheme, customInstructions]);

  const toggleRecording = useCallback(async () => {
    if (!session || !isConnected) return;

    if (isRecording) {
      // Stop recording and save
      setIsRecording(false);
      setIsSaving(true);
      setSaveStatus("Saving conversation...");
      try {
        const { blob, duration } = await recorderRef.current.stop();
        await saveConversation(blob, duration, transcript, THEMES[selectedTheme].label);
        setSaveStatus("Saved!");
        setTimeout(() => setSaveStatus(null), 3000);
      } catch (err: any) {
        setSaveStatus(null);
        setError(err.message || "Failed to save recording");
      } finally {
        setIsSaving(false);
      }
    } else {
      // Start recording
      const stream = session.getRecordingStream();
      if (!stream) {
        setError("Recording stream not available. Start a conversation first.");
        return;
      }
      recorderRef.current.start(stream);
      setIsRecording(true);
      setSaveStatus(null);
    }
  }, [session, isConnected, isRecording, transcript, selectedTheme]);

  const stopSession = useCallback(async () => {
    if (isRecording) {
      await toggleRecording();
    }

    if (session) {
      session.disconnect();
      setSession(null);
    }
    setIsConnected(false);
    if (transcript) {
      setHistory(prev => [transcript, ...prev].slice(0, 5));
    }
  }, [session, transcript, isRecording, toggleRecording]);

  const toggleConnection = async () => {
    if (isConnected) {
      await stopSession();
    } else {
      startSession();
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !session || !isConnected) return;
    
    session.sendText(inputText);
    setTranscript(prev => prev + "\n\n**You:** " + inputText);
    setInputText("");
  };

  const downloadTranscript = () => {
    if (!transcript) return;
    const blob = new Blob([transcript.replace(/\*\*/g, '')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonic-wisdom-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearTranscript = () => {
    if (window.confirm("Clear the current conversation transcript?")) {
      setTranscript("");
      lastSpeakerRef.current = null;
    }
  };

  return (
    <AuthGate>
    <div className="relative min-h-screen flex flex-col items-center p-6 overflow-y-auto">
      <div className="atmosphere fixed inset-0 pointer-events-none" />
      
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <img src="https://favicons.vegvisr.org/favicons/1772468624359-1-1772468669531-512x512.png" alt="Sonic Wisdom" className="w-[100px] h-[100px] rounded-full shadow-lg shadow-orange-900/20" />
          <h1 className="text-2xl font-serif font-light tracking-widest uppercase">Sonic Wisdom</h1>
        </div>
        
        <div className="flex gap-4">
          <UserBadge />
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 right-8 z-20 glass p-6 rounded-2xl w-64 space-y-4"
          >
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Voice Presence</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'Kore', label: 'Kore (F)' },
                  { id: 'Zephyr', label: 'Zephyr (M)' },
                  { id: 'Puck', label: 'Puck (M)' },
                  { id: 'Charon', label: 'Charon (M)' }
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={`text-xs py-2 rounded-lg border transition-all ${
                      voice === v.id 
                        ? 'bg-white text-black border-white' 
                        : 'border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Theme</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(THEMES).map(([id, theme]) => (
                  <button
                    key={id}
                    onClick={() => setSelectedTheme(id)}
                    className={`text-[10px] py-2 px-3 rounded-lg border transition-all text-left ${
                      selectedTheme === id 
                        ? 'bg-orange-500 text-white border-orange-500' 
                        : 'border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Conversation Style</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'sage', label: 'Sage' },
                  { id: 'interviewer', label: 'Interviewer' },
                  { id: 'podcast', label: 'Podcast' },
                  { id: 'custom', label: 'Custom' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setConversationStyle(s.id)}
                    className={`text-[10px] py-1.5 rounded-lg border transition-all ${
                      conversationStyle === s.id 
                        ? 'bg-orange-500 text-white border-orange-500' 
                        : 'border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {conversationStyle === 'custom' && (
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Define your own rules..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white/80 focus:outline-none focus:border-orange-500/50 h-20 resize-none"
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Temperature</label>
                <span className="text-[10px] text-white/60">{temperature.toFixed(1)}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1.5" 
                step="0.1" 
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-orange-500"
              />
              <p className="text-[8px] text-white/20 leading-tight">
                Higher temperature leads to more creative and varied responses.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="w-full max-w-3xl flex flex-col items-center gap-8 z-10 py-24 px-6 min-h-screen">
        <div className="text-center space-y-4">
          <motion.h2 
            key={selectedTheme}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-serif font-light italic text-white/90"
          >
            {isConnected ? "Listening to the Unseen..." : THEMES[selectedTheme].label}
          </motion.h2>
          <p className="text-white/40 font-light tracking-widest uppercase text-xs">
            {THEMES[selectedTheme].description}
          </p>
        </div>

        {/* Visualizer & Mic Button */}
        <div className="relative flex flex-col items-center gap-8">
          <div className="relative">
            <AnimatePresence>
              {isConnected && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="absolute inset-0 pulse-ring rounded-full border border-orange-500/30" 
                />
              )}
            </AnimatePresence>
            
            <button
              onClick={toggleConnection}
              className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
                isConnected
                  ? 'bg-white text-black scale-110 shadow-[0_0_50px_rgba(255,255,255,0.2)]'
                  : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
              }`}
            >
              {isConnected ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8 opacity-50" />}
            </button>
          </div>

          {/* Record Button - visible when connected */}
          {isConnected && (
            <button
              onClick={toggleRecording}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs uppercase tracking-widest transition-all ${
                isRecording
                  ? 'bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/30'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isRecording ? (
                <Square className="w-3 h-3 fill-red-400" />
              ) : (
                <Circle className="w-3 h-3 fill-red-500 text-red-500" />
              )}
              {isSaving ? 'Saving...' : isRecording ? 'Stop Recording' : 'Record'}
            </button>
          )}

          {/* Save Status */}
          {saveStatus && !isSaving && (
            <p className="text-xs text-emerald-400/80 tracking-widest uppercase">{saveStatus}</p>
          )}

          <Visualizer isActive={isConnected} />
        </div>

        {/* Transcription Area */}
        <div className="w-full flex flex-col items-center gap-6">
          <AnimatePresence mode="wait">
            {isConnected || transcript ? (
              <motion.div
                key="transcript"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass rounded-3xl p-6 md:p-8 w-full space-y-6 flex flex-col max-h-[60vh]"
              >
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" />
                    <span>Sacred Transcription</span>
                  </div>
                  <div className="flex gap-2">
                    {transcript && (
                      <>
                        <button 
                          onClick={downloadTranscript}
                          className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all"
                          title="Download Transcript"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={clearTranscript}
                          className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-red-400 transition-all"
                          title="Clear Transcript"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto pr-4 custom-scrollbar"
                >
                  <div className="markdown-body text-lg md:text-xl font-serif leading-relaxed text-white/80 italic">
                    <Markdown>{transcript || "Speak or type to begin your journey..."}</Markdown>
                  </div>
                </div>

                {isConnected && (
                  <form onSubmit={handleSendText} className="relative w-full max-w-md mx-auto pt-4 border-t border-white/5">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Type a sacred word..."
                      className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-6 pr-12 text-sm focus:outline-none focus:border-orange-500/50 transition-all placeholder:text-white/20"
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-orange-500 hover:text-orange-400 disabled:opacity-30 disabled:text-white/20 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </motion.div>
            ) : history.length > 0 ? (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full space-y-6"
              >
                <div className="flex items-center gap-2 text-white/30 text-xs uppercase tracking-widest mb-4">
                  <History className="w-3 h-3" />
                  <span>Recent Echoes</span>
                </div>
                {history.map((item, i) => (
                  <div key={i} className="text-white/40 font-serif italic text-lg border-l border-white/10 pl-6 py-2">
                    {item.slice(0, 150)}...
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center space-y-2 text-white/20"
              >
                <Sparkles className="w-6 h-6 mx-auto mb-4 opacity-50" />
                <p>Ask about Norse Galdr, Vedic Mantras, or the Sufi Dhikr.</p>
                <p className="text-sm">Experience the wisdom of sound.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass max-w-md w-full p-8 rounded-3xl space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-2xl font-serif">About Sonic Wisdom</h3>
              <div className="space-y-4 text-white/60 leading-relaxed font-light">
                <p>
                  Sonic Wisdom is an immersive exploration across multiple domains of knowledge. 
                  Using the Gemini Live API, you can have real-time voice conversations across several primary themes:
                </p>
                <ul className="list-disc list-inside space-y-2">
                  <li><span className="text-white">Sonic Wisdom:</span> Ancient sound traditions, Galdr, Mantras, and Dhikr.</li>
                  <li><span className="text-white">Tech Explorer:</span> Cloudflare Serverless, AI, LLM inference, and coding.</li>
                  <li><span className="text-white">Holistic Wellness:</span> Trauma prevention, Bioenergetics, and Body Work.</li>
                  <li><span className="text-white">Knowledge Management:</span> Organizational KM, SECI model, and knowledge cycles.</li>
                  <li><span className="text-white">Book Writing:</span> Creative writing, storytelling, and publishing.</li>
                  <li><span className="text-white">Cohesion:</span> Group dynamics, unity, and the forces that bind teams.</li>
                </ul>
                <p>
                  Switch themes in the settings panel and choose your conversation style—from a deep Sage to a curious Interviewer.
                </p>
              </div>
              <button 
                onClick={() => setShowInfo(false)}
                className="w-full py-4 rounded-2xl bg-white text-black font-medium hover:bg-orange-50 transition-colors"
              >
                Begin Journey
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-500/20 border border-red-500/50 backdrop-blur-xl px-6 py-3 rounded-full text-red-200 text-sm"
          >
            {error}
            <button onClick={() => setError(null)} className="ml-4 font-bold">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="absolute bottom-8 text-white/10 text-[10px] uppercase tracking-[0.3em]">
        Resonating across cultures & traditions
      </footer>
    </div>
    </AuthGate>
  );
}
