/**
 * 브라우저별로 지원하는 음성 녹음 MIME 을 고릅니다 (MediaRecorder).
 */
export function pickCommunityMessengerVoiceRecorderMime(): { mimeType: string; fileExtension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/ogg", ext: "ogg" },
  ];
  for (const { mime, ext } of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return { mimeType: mime, fileExtension: ext };
    } catch {
      /* ignore */
    }
  }
  return null;
}
