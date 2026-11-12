import { useState, useEffect, useRef, useCallback } from 'react';

function chunkText(text: string, maxChars = 180): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.length > 200000
    ? null
    : text.match(/[^.!?。！？\n]+[.!?。！？\n]*\s*/g);
  if (!sentences) {
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      parts.push(text.slice(i, i + maxChars));
    }
    return parts;
  }

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const words = sentence.split(/(\s+)/);
      let wordChunk = '';
      for (const word of words) {
        if ((wordChunk + word).length > maxChars && wordChunk) {
          chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk += word;
        }
      }
      if (wordChunk) current = wordChunk;
    } else if ((current + sentence).length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [supported] = useState(
    typeof window !== 'undefined' && 'speechSynthesis' in window
  );

  const isSpeakingRef = useRef(false);

  useEffect(() => {
    if (!supported) return;

    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
        setSelectedVoiceURI((prev) => {
          if (prev) return prev;
          const enVoice = availableVoices.find((v) => v.lang.startsWith('en'));
          return (enVoice ?? availableVoices[0]).voiceURI;
        });
      }
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;

      speechSynthesis.cancel();
      isSpeakingRef.current = true;

      const chunks = chunkText(text);
      let offset = 0;
      const offsets = chunks.map((c) => {
        const start = offset;
        offset += c.length;
        return start;
      });
      const totalChars = text.length;

      const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
      const currentRate = rate;
      const currentPitch = pitch;
      const currentVolume = volume;

      setIsSpeaking(true);
      setIsPaused(false);
      setProgress(0);

      const speakChunk = (index: number) => {
        if (!isSpeakingRef.current) return;

        if (index >= chunks.length) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setIsPaused(false);
          setProgress(100);
          setCurrentText('');
          return;
        }

        const chunk = chunks[index];
        setCurrentText(chunk);

        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voice) utterance.voice = voice;
        utterance.rate = currentRate;
        utterance.pitch = currentPitch;
        utterance.volume = currentVolume;

        const chunkOffset = offsets[index];

        utterance.onboundary = (event) => {
          if (!isSpeakingRef.current) return;
          const globalChar = chunkOffset + (event.charIndex || 0);
          const pct = Math.min(100, (globalChar / totalChars) * 100);
          setProgress(pct);
        };

        utterance.onend = () => {
          if (!isSpeakingRef.current) return;
          const completedChars = chunkOffset + chunk.length;
          const pct = Math.min(100, (completedChars / totalChars) * 100);
          setProgress(pct);
          speakChunk(index + 1);
        };

        utterance.onerror = (event) => {
          if (event.error === 'canceled' || event.error === 'interrupted') return;
          if (!isSpeakingRef.current) return;
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setIsPaused(false);
        };

        speechSynthesis.speak(utterance);
      };

      setTimeout(() => speakChunk(0), 50);
    },
    [supported, voices, selectedVoiceURI, rate, pitch, volume]
  );

  const pause = useCallback(() => {
    if (!supported || !isSpeakingRef.current) return;
    speechSynthesis.pause();
    setIsPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported || !isSpeakingRef.current) return;
    speechSynthesis.resume();
    setIsPaused(false);
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    isSpeakingRef.current = false;
    speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentText('');
  }, [supported]);

  return {
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    rate,
    setRate,
    pitch,
    setPitch,
    volume,
    setVolume,
    isSpeaking,
    isPaused,
    progress,
    currentText,
    supported,
    speak,
    pause,
    resume,
    stop,
  };
}
