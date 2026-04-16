/**
 * 녹음 Blob 의 실제 재생 길이(초)를 `<audio>` 의 `loadedmetadata` 로 측정한다.
 * 브라우저·코덱에 따라 실패할 수 있으므로 실패 시 `null` 을 반환한다.
 */
export async function measureCommunityMessengerVoiceBlobDurationSeconds(blob: Blob): Promise<number | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(blob);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.muted = true;
    const seconds = await new Promise<number>((resolve, reject) => {
      const done = (v: number) => {
        audio.removeEventListener("loadedmetadata", onOk);
        audio.removeEventListener("error", onErr);
        resolve(v);
      };
      const onOk = () => {
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0.04) done(d);
        else reject(new Error("invalid_duration"));
      };
      const onErr = () => reject(new Error("audio_error"));
      audio.addEventListener("loadedmetadata", onOk, { once: true });
      audio.addEventListener("error", onErr, { once: true });
      audio.src = url;
      void audio.load();
    });
    return seconds;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function measureCommunityMessengerVoiceBlobDurationSecondsWithTimeout(
  blob: Blob,
  timeoutMs = 1800
): Promise<number | null> {
  try {
    return await Promise.race([
      measureCommunityMessengerVoiceBlobDurationSeconds(blob),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}
