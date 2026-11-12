import { useState, useEffect, useCallback, useRef, useDeferredValue, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  AudioLines,
  Trash2,
  ChevronDown,
  Volume2,
  Gauge,
  Music2,
  Check,
  FileText,
  BookOpen,
  Zap,
  Download,
  Info,
  X,
  Loader2,
} from 'lucide-react';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { useTtsApi } from '@/hooks/useTtsApi';
import { countWords, formatDuration } from '@/lib/textStats';

const SAMPLE_TEXTS = {
  short:
    'Welcome to VoiceCraft! Type any text here and press play to hear it spoken aloud.',
  medium:
    'VoiceCraft is a powerful text-to-speech tool that converts any written text into natural-sounding speech. Whether you need to listen to a long article, proofread your writing, or simply prefer audio over text, VoiceCraft has you covered. Just paste your text, choose a voice, and press play.',
  long:
    'In the realm of digital communication, text-to-speech technology has become an indispensable tool. It bridges the gap between written content and auditory learning, making information accessible to everyone regardless of their reading ability or visual impairment.\n\nFrom students who learn better by listening, to professionals who want to consume written content on the go, text-to-speech tools have transformed how we interact with information. The ability to convert any text into natural-sounding speech opens up new possibilities for productivity and accessibility.\n\nVoiceCraft continues this tradition by providing a simple, intuitive interface for converting text to speech. With multiple voices to choose from and adjustable speed and pitch settings, you can customize the listening experience to suit your preferences. Whether you are listening to a short paragraph or a lengthy document, VoiceCraft handles it all with ease.',
};

const LIVE_PREVIEW_LIMIT = 20000;

function App() {
  const [text, setText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_heart');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tts = useSpeechSynthesis();
  const { voices: browserVoices, setSelectedVoiceURI } = tts;
  const api = useTtsApi();
  const deferredText = useDeferredValue(text);

  const wordCount = useMemo(() => countWords(deferredText), [deferredText]);
  const charCount = deferredText.length;
  const estimatedSeconds =
    wordCount > 0 ? (wordCount / (150 * tts.rate)) * 60 : 0;
  const useLivePreview = text.length <= LIVE_PREVIEW_LIMIT;
  const apiVoices = api.voices;
  const selectedVoiceInfo = apiVoices.find((v) => v.name === selectedVoice);
  const voiceGroups = useMemo(() => {
    const groups = new Map<string, typeof apiVoices>();
    for (const voice of apiVoices) {
      const key = voice.language || voice.locale;
      const list = groups.get(key);
      if (list) list.push(voice);
      else groups.set(key, [voice]);
    }
    return Array.from(groups.entries());
  }, [apiVoices]);

  useEffect(() => {
    if (api.voices.length === 0) return;
    setSelectedVoice((prev) => {
      if (api.voices.some((v) => v.name === prev)) return prev;
      const heart = api.voices.find((v) => v.name === 'af_heart');
      const en = api.voices.find((v) => v.locale.startsWith('en'));
      return (heart ?? en ?? api.voices[0]).name;
    });
  }, [api.voices]);

  useEffect(() => {
    const selected = api.voices.find((v) => v.name === selectedVoice);
    const locale = (selected?.locale || 'en-US').toLowerCase();
    const gender = (selected?.gender || '').toLowerCase();
    const langMatch = (v: SpeechSynthesisVoice) => {
      const lang = v.lang.replace('_', '-').toLowerCase();
      return lang === locale || lang.startsWith(locale.slice(0, 2));
    };
    const genderMatch = (v: SpeechSynthesisVoice) => {
      const name = `${v.name} ${v.voiceURI}`.toLowerCase();
      if (gender === 'female') return /female|zira|samantha|susan|hazel|linda|helen|eva/.test(name);
      if (gender === 'male') return /male|david|mark|george|daniel|richard|james/.test(name);
      return true;
    };
    const match =
      browserVoices.find((v) => langMatch(v) && genderMatch(v)) ||
      browserVoices.find((v) => langMatch(v));
    if (match) setSelectedVoiceURI(match.voiceURI);
  }, [selectedVoice, browserVoices, setSelectedVoiceURI, api.voices]);

  const handlePlayPause = useCallback(async () => {
    if (previewUrl && audioRef.current) {
      if (!audioRef.current.paused) {
        audioRef.current.pause();
        return;
      }
      await audioRef.current.play().catch(() => undefined);
      return;
    }
    if (!useLivePreview) return;
    if (tts.isSpeaking && !tts.isPaused) tts.pause();
    else if (tts.isSpeaking && tts.isPaused) tts.resume();
    else tts.speak(text);
  }, [previewUrl, tts, text, useLivePreview]);

  const handleClear = useCallback(() => {
    tts.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    api.clear();
    setPreviewUrl(null);
    setIsAudioPlaying(false);
    setText('');
  }, [tts, api]);

  const handleStopAll = useCallback(() => {
    tts.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsAudioPlaying(false);
    }
  }, [tts]);

  const handleGenerateVoice = useCallback(async () => {
    tts.stop();
    const result = await api.generate(text, selectedVoice, tts.rate, tts.pitch);
    if (!result) return;
    setPreviewUrl(result.url);
  }, [api, text, selectedVoice, tts]);

  const handleListen = useCallback(async () => {
    if (previewUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play().catch(() => undefined);
      return;
    }
    await handleGenerateVoice();
  }, [previewUrl, handleGenerateVoice]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerateVoice();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleStopAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleGenerateVoice, handleStopAll]);

  const canPlay = text.trim().length > 0 && (tts.supported || !!previewUrl);
  const displayProgress = api.isGenerating ? api.progress : tts.progress;
  const isCompleted =
    (!api.isGenerating && previewUrl) || (tts.progress === 100 && !tts.isSpeaking);
  const canGenerate = text.trim().length > 0 && !api.isGenerating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-teal-500/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[400px] bg-cyan-500/[0.04] rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-8 sm:py-12 min-h-screen flex flex-col">
        <header className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <AudioLines className="w-6 h-6 text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                VoiceCraft
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Text to Speech Converter
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowHelp(true)}
            className="w-9 h-9 rounded-full bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-teal-400 hover:border-teal-500/50 transition-colors"
            aria-label="How to use"
          >
            <Info className="w-4 h-4" />
          </button>
        </header>

        {showHelp && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowHelp(false)}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold text-teal-400">
                  How to use
                </h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="space-y-3 text-sm text-slate-400 leading-relaxed">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <span>Text paste karo. Length ki koi limit nahi hai.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>
                    Voice select karo, phir <strong className="text-slate-200">Generate Voice</strong> dabao.
                    Jo voice choose karoge usi speaker me audio banegi.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <span>
                    Voice ready hone ke baad neeche{' '}
                    <strong className="text-slate-200">Save to PC</strong> se
                    file download karo.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        )}

        {!tts.supported ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 bg-red-900/20 border border-red-800/50 rounded-2xl">
              <p className="text-red-400 font-medium">
                Speech synthesis not supported
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Your browser doesn't support text-to-speech. Try Chrome, Edge, or
                Safari.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-5">
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '0.05s' }}
            >
              <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden">
                <textarea
                  value={text}
                  onChange={(e) => {
                    const next = e.target.value;
                    setText(next);
                    if (previewUrl) setPreviewUrl(null);
                  }}
                  placeholder="Type or paste any text here — no length limit. Press Ctrl+Enter to generate."
                  className="w-full h-56 sm:h-64 p-5 bg-transparent text-slate-100 placeholder-slate-600 resize-none focus:outline-none text-base leading-relaxed"
                  spellCheck={false}
                />
                <div className="px-5 py-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>{wordCount.toLocaleString()} words</span>
                    <span>{charCount.toLocaleString()} chars</span>
                    {wordCount > 0 && (
                      <span className="text-teal-500/70">
                        ~{formatDuration(estimatedSeconds)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setText(SAMPLE_TEXTS.short)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Zap className="w-3 h-3" /> Short
                    </button>
                    <button
                      onClick={() => setText(SAMPLE_TEXTS.medium)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <FileText className="w-3 h-3" /> Medium
                    </button>
                    <button
                      onClick={() => setText(SAMPLE_TEXTS.long)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <BookOpen className="w-3 h-3" /> Long
                    </button>
                    <button
                      onClick={handleClear}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '0.08s' }}
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleListen}
                  disabled={!canGenerate && !previewUrl}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-semibold text-base bg-slate-800 border border-slate-700 text-slate-100 hover:border-teal-500/50 hover:text-teal-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                  Listen
                </button>
                <button
                  onClick={handleGenerateVoice}
                  disabled={!canGenerate}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-semibold text-base bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {api.isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating {Math.round(api.progress)}%
                    </>
                  ) : (
                    <>
                      <AudioLines className="w-5 h-5" />
                      Generate Voice
                    </>
                  )}
                </button>
              </div>
            </div>

            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '0.1s' }}
            >
              <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <button
                    onClick={handlePlayPause}
                    disabled={!canPlay || (!previewUrl && !useLivePreview)}
                    aria-label={
                      (tts.isSpeaking && !tts.isPaused) || isAudioPlaying
                        ? 'Pause'
                        : 'Play'
                    }
                    className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                  >
                    {(tts.isSpeaking && !tts.isPaused) || isAudioPlaying ? (
                      <Pause
                        className="w-6 h-6 text-slate-950"
                        fill="currentColor"
                      />
                    ) : (
                      <Play
                        className="w-6 h-6 text-slate-950 ml-0.5"
                        fill="currentColor"
                      />
                    )}
                  </button>

                  <button
                    onClick={handleStopAll}
                    disabled={!tts.isSpeaking && !isAudioPlaying}
                    aria-label="Stop"
                    className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 hover:border-slate-600 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Square
                      className="w-4 h-4 text-slate-300"
                      fill="currentColor"
                    />
                  </button>

                  {(tts.isSpeaking && !tts.isPaused) || api.isGenerating ? (
                    <div className="flex items-center gap-1 h-8">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="w-1 bg-teal-400 rounded-full origin-bottom"
                          style={{
                            height: '100%',
                            animation: 'visualizer 0.8s ease-in-out infinite',
                            animationDelay: `${i * 0.12}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div className="ml-auto text-right">
                    {isCompleted && !api.isGenerating ? (
                      <div className="flex items-center gap-1.5 text-teal-400">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-medium">Done</span>
                      </div>
                    ) : (
                      <div className="font-display text-3xl font-bold text-teal-400 tabular-nums">
                        {Math.round(displayProgress)}
                        <span className="text-lg text-teal-500/50">%</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                    style={{
                      width: `${displayProgress}%`,
                      boxShadow:
                        displayProgress > 0
                          ? '0 0 10px rgba(45, 212, 191, 0.5)'
                          : 'none',
                    }}
                  >
                    {(api.isGenerating || (tts.isSpeaking && !tts.isPaused)) &&
                      displayProgress > 0 &&
                      displayProgress < 100 && (
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                          style={{ animation: 'shimmer 1.5s linear infinite' }}
                        />
                      )}
                  </div>
                </div>

                {api.isGenerating && (
                  <div className="mt-3 text-xs text-teal-400">
                    {selectedVoiceInfo?.displayName || 'Voice'} generate ho rahi hai. Lambi text me time lag sakta hai — window band mat karo.
                  </div>
                )}

                {!useLivePreview && !previewUrl && !api.isGenerating && (
                  <div className="mt-3 text-xs text-slate-400">
                    Bahut lambi text hai. Live play ki jagah Generate Voice use karo.
                  </div>
                )}

                {api.error && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 rounded-lg p-2.5">
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{api.error}</span>
                  </div>
                )}

                {previewUrl && !api.isGenerating && (
                  <div className="mt-4 bg-teal-950/30 border border-teal-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-teal-400" />
                      <span className="text-sm font-semibold text-teal-400 uppercase tracking-wider">
                        Voice Ready
                        {selectedVoiceInfo ? ` · ${selectedVoiceInfo.displayName}` : ''}
                      </span>
                    </div>
                    <audio
                      ref={audioRef}
                      controls
                      preload="none"
                      src={previewUrl}
                      className="w-full mb-3"
                      style={{ colorScheme: 'dark' }}
                      onPlay={() => setIsAudioPlaying(true)}
                      onPause={() => setIsAudioPlaying(false)}
                      onEnded={() => setIsAudioPlaying(false)}
                    />
                    <button
                      onClick={() => api.download(previewUrl)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-semibold rounded-lg transition-colors active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      Save to PC
                    </button>
                  </div>
                )}

                {tts.isSpeaking && tts.currentText && (
                  <div className="mt-4 p-3 bg-slate-800/40 rounded-xl border border-teal-500/10">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full ${tts.isPaused ? 'bg-amber-400' : 'bg-teal-400 animate-pulse'}`}
                      />
                      <span className="text-xs text-teal-400 font-medium uppercase tracking-wider">
                        {tts.isPaused ? 'Paused' : 'Now speaking'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                      {tts.currentText.trim()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div
              className="animate-fade-in-up"
              style={{ animationDelay: '0.15s' }}
            >
              <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  Voice Settings
                </h2>

                <div className="mb-5">
                  <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                    <Volume2 className="w-3.5 h-3.5" /> Voice
                  </label>
                  {api.loadingVoices && api.voices.length === 0 ? (
                    <p className="text-sm text-slate-600 py-3">
                      Loading available voices...
                    </p>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedVoice}
                        onChange={(e) => {
                          setSelectedVoice(e.target.value);
                          setPreviewUrl(null);
                        }}
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-3 pr-10 text-sm text-slate-100 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 transition-all appearance-none cursor-pointer"
                      >
                        {voiceGroups.map(([group, list]) => (
                          <optgroup key={group} label={group}>
                            {list.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.displayName} ({v.gender})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                  )}
                </div>

                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Gauge className="w-3.5 h-3.5" /> Speed
                    </label>
                    <span className="text-xs font-medium text-teal-400 tabular-nums">
                      {tts.rate.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={tts.rate}
                    onChange={(e) => {
                      tts.setRate(Number(e.target.value));
                      setPreviewUrl(null);
                    }}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Music2 className="w-3.5 h-3.5" /> Pitch
                    </label>
                    <span className="text-xs font-medium text-teal-400 tabular-nums">
                      {tts.pitch.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={tts.pitch}
                    onChange={(e) => {
                      tts.setPitch(Number(e.target.value));
                      setPreviewUrl(null);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-slate-600">
          <p>
            Tip: Press{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400 text-[10px]">
              Ctrl+Enter
            </kbd>{' '}
            to generate ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400 text-[10px]">
              Esc
            </kbd>{' '}
            to stop
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
