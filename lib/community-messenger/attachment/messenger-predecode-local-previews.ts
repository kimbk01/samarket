/**
 * 보내는 중 말풍선을 넣기 전에 로컬 사진(blob·data URL)을 미리 디코딩한다 — SSOT M3.
 * 2026-11-16 Samsung 녹화: 디코딩 전에 말풍선을 넣어 묶음 칸이 약 0.1초 회색이었다.
 * 같은 주소의 디코딩 결과는 브라우저 이미지 캐시를 같이 써서 말풍선이 바로 그려진다.
 * 오래 걸리면 기다리지 않는다(상한 `timeoutMs`) — 전송 지연을 키우지 않게.
 */
export const MESSENGER_PREDECODE_TIMEOUT_MS = 300;

export async function predecodeMessengerLocalPreviews(
  urls: string[],
  timeoutMs: number = MESSENGER_PREDECODE_TIMEOUT_MS
): Promise<void> {
  if (typeof Image === "undefined" || urls.length === 0) return;
  const decodeOne = (u: string) =>
    new Promise<void>((resolve) => {
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = u;
        if (typeof img.decode === "function") void img.decode().then(() => resolve(), () => resolve());
        else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      } catch {
        resolve();
      }
    });
  let timer: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    Promise.all(urls.map(decodeOne)).then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, timeoutMs));
    }),
  ]);
  if (timer) clearTimeout(timer);
}
