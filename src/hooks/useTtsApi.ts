import { useCallback, useEffect, useRef, useState } from 'react';

export type TtsVoice = {
  name: string;
  displayName: string;
  gender: string;
  locale: string;
  language?: string;
};

export type GenerateResult = {
  url: string;
  mime: string;
};

type JobStatus = {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  percent: number;
  mime: string;
  error: string | null;
};

function rateToEdge(rate: number): string {
  const pct = Math.round((rate - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function pitchToEdge(pitch: number): string {
  const hz = Math.round((pitch - 1) * 50);
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useTtsApi() {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef('');
  const audioUrlRef = useRef<string | null>(null);
  const mimeRef = useRef('audio/mpeg');
  const jobIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/voices')
      .then((res) => {
        if (!res.ok) throw new Error('voices failed');
        return res.json();
      })
      .then((data: TtsVoice[]) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setVoices(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVoices([
            { name: 'af_heart', displayName: 'Heart', gender: 'Female', locale: 'en-US', language: 'American English' },
            { name: 'af_bella', displayName: 'Bella', gender: 'Female', locale: 'en-US', language: 'American English' },
            { name: 'am_michael', displayName: 'Michael', gender: 'Male', locale: 'en-US', language: 'American English' },
            { name: 'bf_emma', displayName: 'Emma', gender: 'Female', locale: 'en-GB', language: 'British English' },
            { name: 'bm_george', displayName: 'George', gender: 'Male', locale: 'en-GB', language: 'British English' },
            { name: 'in_neerja', displayName: 'Neerja', gender: 'Female', locale: 'en-IN', language: 'Indian English' },
            { name: 'hi_swara', displayName: 'Swara', gender: 'Female', locale: 'hi-IN', language: 'Hindi' },
          ]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (audioUrlRef.current && audioUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (jobIdRef.current) {
        fetch(`/api/generate/${jobIdRef.current}`, { method: 'DELETE' }).catch(() => undefined);
      }
    };
  }, []);

  const generate = useCallback(
    async (text: string, voice: string, rate: number, pitch: number) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const key = `${trimmed.length}:${trimmed.slice(0, 80)}:${trimmed.slice(-80)}|${voice}|${rate}|${pitch}`;
      if (audioUrlRef.current && lastKeyRef.current === key) {
        return { url: audioUrlRef.current, mime: mimeRef.current };
      }

      cancelledRef.current = false;
      setIsGenerating(true);
      setProgress(1);
      setError(null);

      try {
        const startRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmed,
            voice,
            rate: rateToEdge(rate),
            pitch: pitchToEdge(pitch),
          }),
        });
        if (!startRes.ok) {
          const body = await startRes.json().catch(() => null);
          throw new Error(body?.error || 'Generation failed');
        }
        const started = (await startRes.json()) as JobStatus;
        jobIdRef.current = started.id;
        setProgress(Math.max(1, started.percent || 1));

        let job = started;
        while (job.status === 'running') {
          if (cancelledRef.current) return null;
          await sleep(job.total > 200 ? 800 : 400);
          const poll = await fetch(`/api/generate/${started.id}`);
          if (!poll.ok) throw new Error('Progress check failed');
          job = (await poll.json()) as JobStatus;
          setProgress(Math.max(1, Math.min(99, job.percent || 1)));
        }

        if (job.status !== 'done') {
          throw new Error(job.error || 'Generation failed');
        }

        if (audioUrlRef.current && audioUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        const url = `/api/generate/${started.id}/audio?v=${encodeURIComponent(voice)}`;
        audioUrlRef.current = url;
        mimeRef.current = job.mime || 'audio/mpeg';
        lastKeyRef.current = key;
        setAudioUrl(url);
        setProgress(100);
        return { url, mime: mimeRef.current } satisfies GenerateResult;
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : 'Voice generate nahi ho payi. Dobara try karein.');
        }
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const download = useCallback((url: string, mime = mimeRef.current) => {
    const ext = mime.includes('wav') ? 'wav' : 'mp3';
    const a = document.createElement('a');
    a.href = url;
    a.download = `voicecraft-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const clear = useCallback(() => {
    cancelledRef.current = true;
    if (audioUrlRef.current && audioUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = null;
    lastKeyRef.current = '';
    jobIdRef.current = null;
    setAudioUrl(null);
    setError(null);
    setProgress(0);
  }, []);

  return {
    voices,
    loadingVoices,
    audioUrl,
    isGenerating,
    progress,
    error,
    generate,
    download,
    clear,
  };
}
