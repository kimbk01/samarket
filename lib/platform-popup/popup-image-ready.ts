/**
 * D-27 (Owner 「설계안대로」 2026-11-04): 팝업 틀은 소재 이미지가 **디코드까지 끝난 뒤**에만 보인다(PTR 과 같은 원칙).
 * 3초 안에 준비되지 않으면 `timeout` — 호스트는 이번 앱 실행 동안 그 캠페인을 건너뛴다.
 */

export const PLATFORM_POPUP_IMAGE_READY_TIMEOUT_MS = 3000;

export type PlatformPopupImageReadyResult = "ready" | "failed" | "timeout";

type ImageLike = {
  decoding?: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
  decode?: () => Promise<void>;
};

export function waitPlatformPopupImageReady(
  url: string,
  opts: {
    timeoutMs?: number;
    /** 시험용 — 기본은 브라우저 `Image` */
    createImage?: () => ImageLike;
  } = {}
): Promise<PlatformPopupImageReadyResult> {
  const src = String(url ?? "").trim();
  if (!src) return Promise.resolve("failed");
  const create =
    opts.createImage ??
    (typeof Image !== "undefined" ? () => new Image() as unknown as ImageLike : null);
  if (!create) return Promise.resolve("failed");
  const timeoutMs = opts.timeoutMs ?? PLATFORM_POPUP_IMAGE_READY_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: PlatformPopupImageReadyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => settle("timeout"), timeoutMs);
    const img = create();
    img.decoding = "async";
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(
          () => settle("ready"),
          // 로드는 됐는데 decode 만 거부(일부 WebView) — 그릴 수 있으므로 준비로 본다
          () => settle("ready")
        );
      } else settle("ready");
    };
    img.onerror = () => settle("failed");
    img.src = src;
  });
}
