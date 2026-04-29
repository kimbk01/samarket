/** 브라우저 내 이미지 편집용 캔버스 유틸 (거래 글쓰기 등) */

export const EDIT_MAX_EDGE = 1600;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    img.src = url;
  });
}

/** 긴 변 기준 다운스케일 후 작업용 캔버스 생성 */
export function createWorkingCanvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  let tw = nw;
  let th = nh;
  const max = EDIT_MAX_EDGE;
  if (nw > max || nh > max) {
    const s = max / Math.max(nw, nh);
    tw = Math.round(nw * s);
    th = Math.round(nh * s);
  }
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, tw, th);
  return c;
}

/** 시계 방향 90° 회전한 새 캔버스 */
export function rotateCanvas90CW(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const out = document.createElement("canvas");
  out.width = h;
  out.height = w;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** 정규화된 자르기 영역 (0~1) 적용 */
export function cropCanvasNormalized(
  src: HTMLCanvasElement,
  nx: number,
  ny: number,
  nw: number,
  nh: number
): HTMLCanvasElement {
  const x = Math.round(nx * src.width);
  const y = Math.round(ny * src.height);
  const w = Math.max(1, Math.round(nw * src.width));
  const h = Math.max(1, Math.round(nh * src.height));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}

function colorDist(
  r: number,
  g: number,
  b: number,
  r2: number,
  g2: number,
  b2: number
): number {
  return Math.sqrt((r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2);
}

/** 클릭 지점과 유사한 연결 영역을 투명 처리 (단색·유사 배경용) */
export function floodFillTransparent(
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  tolerance: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const ti = (Math.floor(sy) * w + Math.floor(sx)) * 4;
  const tr = d[ti];
  const tg = d[ti + 1];
  const tb = d[ti + 2];

  const visited = new Uint8Array(w * h);
  const stack: number[] = [Math.floor(sy) * w + Math.floor(sx)];

  while (stack.length) {
    const cur = stack.pop()!;
    if (visited[cur]) continue;
    visited[cur] = 1;
    const px = cur % w;
    const py = (cur / w) | 0;
    const i = cur * 4;
    const a = d[i + 3];
    if (a === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (colorDist(r, g, b, tr, tg, tb) > tolerance) continue;

    d[i + 3] = 0;

    if (px > 0) stack.push(cur - 1);
    if (px < w - 1) stack.push(cur + 1);
    if (py > 0) stack.push(cur - w);
    if (py < h - 1) stack.push(cur + w);
  }

  ctx.putImageData(img, 0, 0);
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const cb = (blob: Blob | null) => {
      if (blob) resolve(blob);
      else reject(new Error("blob"));
    };
    if (type === "image/png") {
      canvas.toBlob(cb, type);
    } else {
      canvas.toBlob(cb, type, quality);
    }
  });
}

export function blobToFile(blob: Blob, name = "edited.jpg"): File {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
