/**
 * 음성 녹음 MIME 우선순위 — 모든 플랫폼에서 MP4(AAC) 를 먼저 시도한다.
 * iOS WKWebView 는 WebM/Opus 재생을 보장하지 않으므로, Android/데스크톱에서도 MP4 녹음이 가능하면
 * (최신 Chrome Android·데스크톱은 `audio/mp4` 지원) 서버 트랜스코딩 없이 양쪽에서 재생되게 한다.
 * MP4 미지원 브라우저에서만 WebM/Opus → Ogg/Opus 로 폴백.
 * `mp4a.40.2`(AAC-LC) 를 명시한 후보를 먼저 둬 Opus-in-MP4 보다 AAC 를 우선한다.
 */
export const COMMUNITY_MESSENGER_VOICE_RECORDER_MIME_CANDIDATES: ReadonlyArray<{ mime: string; ext: string }> = [
  { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/ogg", ext: "ogg" },
];

/** 테스트 가능한 순수 선택기 — `isTypeSupported` 만 주입 */
export function pickVoiceRecorderMimeFrom(
  isTypeSupported: ((mime: string) => boolean) | null | undefined
): { mimeType: string; fileExtension: string } {
  if (typeof isTypeSupported !== "function") {
    return { mimeType: "", fileExtension: "webm" };
  }
  for (const { mime, ext } of COMMUNITY_MESSENGER_VOICE_RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return { mimeType: mime, fileExtension: ext };
    } catch {
      /* ignore */
    }
  }
  return { mimeType: "", fileExtension: "webm" };
}

/**
 * 브라우저별로 지원하는 음성 녹음 MIME 을 고릅니다 (MediaRecorder).
 * 빈 mimeType 이면 `new MediaRecorder(stream)` 기본값을 씁니다 — 실제 형식은 `recorder.mimeType` 으로 확인.
 */
export function pickCommunityMessengerVoiceRecorderMime(): { mimeType: string; fileExtension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "", fileExtension: "webm" };
  }
  return pickVoiceRecorderMimeFrom((mime) => MediaRecorder.isTypeSupported(mime));
}
