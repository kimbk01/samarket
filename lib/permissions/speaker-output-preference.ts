/**
 * HTMLMediaElement.setSinkId 기반 출력 장치 선호 — 브라우저·통화 SDK가 같은 deviceId 를 쓰는 경우 Agora 등과 공유.
 */

export const DIBAY_SPEAKER_OUTPUT_DEVICE_LS_KEY = "dibay.permission.speaker.sinkId";

export function readPreferredSpeakerSinkId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(DIBAY_SPEAKER_OUTPUT_DEVICE_LS_KEY);
    return v?.trim() ? v : null;
  } catch {
    return null;
  }
}

export function writePreferredSpeakerSinkId(deviceId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const id = deviceId?.trim();
    if (id) window.localStorage.setItem(DIBAY_SPEAKER_OUTPUT_DEVICE_LS_KEY, id);
    else window.localStorage.removeItem(DIBAY_SPEAKER_OUTPUT_DEVICE_LS_KEY);
  } catch {
    /* ignore */
  }
}

/** 지원 브라우저에서만 — 실패 시 무시 */
export async function applyPreferredSinkToHtmlAudioElement(audio: HTMLAudioElement): Promise<void> {
  const id = readPreferredSpeakerSinkId();
  if (!id || typeof HTMLMediaElement === "undefined") return;
  const el = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (typeof el.setSinkId !== "function") return;
  try {
    await el.setSinkId(id);
  } catch {
    /* NOT_ALLOWED_ERR 등 */
  }
}
