/** 0–1 정규화된 파형 막대 값 (클라이언트·메타데이터 공통) */
export const COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS = 48;

export function downsampleVoiceWaveformPeaks(samples: number[], targetBars: number): number[] {
  const n = Math.max(1, Math.floor(targetBars));
  if (samples.length === 0) {
    return Array.from({ length: n }, () => 0.15);
  }
  const out: number[] = [];
  const bucket = samples.length / n;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, samples[j] ?? 0);
    out.push(max);
  }
  const peak = Math.max(0.08, ...out);
  return out.map((v) => Math.min(1, v / peak));
}

export function parseVoiceWaveformPeaksFromMetadata(raw: unknown): number[] | undefined {
  let arr: unknown[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return undefined;
    }
  }
  if (!arr || arr.length === 0) return undefined;
  const out = arr.map((item) => {
    const v = Number(item);
    if (!Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, v));
  });
  if (out.length <= COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS) return out;
  return downsampleVoiceWaveformPeaks(out, COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS);
}
