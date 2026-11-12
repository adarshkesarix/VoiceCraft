export function countWords(text: string): number {
  let words = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const space = text.charCodeAt(i) <= 32;
    if (space) inWord = false;
    else if (!inWord) {
      words += 1;
      inWord = true;
    }
  }
  return words;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min >= 60) {
    const hr = Math.floor(min / 60);
    const rem = min % 60;
    return rem ? `${hr}h ${rem}m` : `${hr}h`;
  }
  if (sec === 0) return `${min}m`;
  return `${min}m ${sec}s`;
}
