import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, Info, Sparkles, History } from 'lucide-react';
import Markdown from 'react-markdown';
import { LiveSessionManager } from './services/LiveSession';
import { fetchLiveConfig } from './services/ApiKeyService';
import { Visualizer } from './components/Visualizer';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [session, setSession] = useState<LiveSessionManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputText, setInputText] = useState("");
  
  // Settings
  const [voice, setVoice] = useState<string>("Kore"); // Default to Female
  const [temperature, setTemperature] = useState<number>(0.7);

  const startSession = useCallback(async () => {
    try {
      setError(null);
      const config = await fetchLiveConfig();

      const newSession = new LiveSessionManager(config.apiKey);
      setSession(newSession);

      await newSession.connect({
        onMessage: (text) => {
          setTranscript(prev => prev + text);
        },
        onInterrupted: () => {
          setTranscript("");
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
        model: config.model
      });

      setIsConnected(true);
      setTranscript("");
    } catch (err: any) {
      setError(err.message || "Failed to initialize session.");
    }
  }, [voice, temperature]);

  const stopSession = useCallback(() => {
    if (session) {
      session.disconnect();
      setSession(null);
    }
    setIsConnected(false);
    if (transcript) {
      setHistory(prev => [transcript, ...prev].slice(0, 5));
    }
  }, [session, transcript]);

  const toggleConnection = () => {
    if (isConnected) {
      stopSession();
    } else {
      startSession();
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !session || !isConnected) return;
    
    session.sendText(inputText);
    setTranscript(prev => prev + "\n\n**You:** " + inputText + "\n\n");
    setInputText("");
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="atmosphere" />
      
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-900/20">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-serif font-light tracking-widest uppercase">Sonic Wisdom</h1>
        </div>
        
        <div className="flex gap-4">
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
      <main className="w-full max-w-2xl flex flex-col items-center gap-12 z-10">
        <div className="text-center space-y-4">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-serif font-light italic text-white/90"
          >
            {isConnected ? "Listening to the Unseen..." : "The Silence Awaits"}
          </motion.h2>
          <p className="text-white/40 font-light tracking-widest uppercase text-xs">
            Explore the sacred phonemes of ancient traditions
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

          <Visualizer isActive={isConnected} />
        </div>

        {/* Transcription Area */}
        <div className="w-full min-h-[200px] flex flex-col items-center gap-6">
          <AnimatePresence mode="wait">
            {isConnected ? (
              <motion.div
                key="transcript"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-3xl p-8 w-full text-center space-y-6"
              >
                <div className="markdown-body text-xl md:text-2xl font-serif leading-relaxed text-white/80 italic">
                  <Markdown>{transcript || "Speak or type to begin your journey..."}</Markdown>
                </div>

                <form onSubmit={handleSendText} className="relative w-full max-w-md mx-auto">
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
                  Sonic Wisdom is an immersive exploration of the world's ancient sound traditions. 
                  Using the Gemini Live API, you can have a real-time voice conversation about:
                </p>
                <ul className="list-disc list-inside space-y-2">
                  <li><span className="text-white">Norse Galdr:</span> The magic of sung runes.</li>
                  <li><span className="text-white">Vedic Mantras:</span> Sacred utterances from the Vedas.</li>
                  <li><span className="text-white">Sufi Dhikr:</span> The rhythmic remembrance of the divine.</li>
                  <li><span className="text-white">Taoist Sounds:</span> The six healing sounds of the organs.</li>
                </ul>
                <p>
                  Connect your microphone and speak naturally. The AI will respond with both voice and text.
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
  );
}
