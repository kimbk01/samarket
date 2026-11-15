/**
 * 보내는 중 말풍선을 넣기 전에 로컬 사진(blob·data URL)을 미리 디코딩하고 크기를 잰다 — SSOT M3.
 * - 디코딩: 말풍선이 회색 칸으로 먼저 나오지 않게(같은 주소는 브라우저 이미지 캐시를 같이 쓴다).
 * - 크기: 보내는 중 사진 메시지에 `imageWidth/imageHeight` 로 넣어, 서버 사진과 같은 칸 크기로 처음부터 그린다
 *   (2026-11-16 측정 F1: 보내는 중 행은 `mergeRoomMessages` 가 pending 을 지워 로컬 비율을 재지 못해 298→179px 로 바뀌었다).
 * 오래 걸리면 기다리지 않는다(상한 `timeoutMs`) — 그 사진은 크기 null.
 */
export const MESSENGER_PREDECODE_TIMEOUT_MS = 300;

export type MessengerLocalPreviewSize = { width: number; height: number } | null;

export async function predecodeMessengerLocalPreviews(
  urls: string[],
  timeoutMs: number = MESSENGER_PREDECODE_TIMEOUT_MS
): Promise<MessengerLocalPreviewSize[]> {
  const sizes: MessengerLocalPreviewSize[] = urls.map(() => null);
  if (typeof Image === "undefined" || urls.length === 0) return sizes;
  const decodeOne = (u: string, i: number) =>
    new Promise<void>((resolve) => {
      try {
        const img = new Image();
        img.decoding = "async";
        const record = () => {
          const w = Math.floor(img.naturalWidth);
          const h = Math.floor(img.naturalHeight);
          if (w > 0 && h > 0) sizes[i] = { width: w, height: h };
          resolve();
        };
        img.src = u;
        if (typeof img.decode === "function") void img.decode().then(record, () => resolve());
        else {
          img.onload = record;
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
  return sizes.slice();
}
