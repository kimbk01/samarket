"use client";

import QRCode from "qrcode";

/** 친구 QR 색 — DIBAY 그린 (`--dibay-green`) on 흰 바탕. 가운데 사진을 얹으므로 오류 정정 H */
export const FRIEND_QR_DARK = "#0B421A";
export const FRIEND_QR_LIGHT = "#FFFFFF";

export function renderFriendQrDataUrl(url: string, width = 480): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width,
    color: { dark: FRIEND_QR_DARK, light: FRIEND_QR_LIGHT },
  });
}

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    if (crossOrigin) el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image_failed"));
    el.src = src;
  });
}

/**
 * 이름 줄 나누기 — 화면 규칙과 같게 말줄임 없이 최대 2줄, 두 줄이면 길이를 고르게(한 글자 줄 방지).
 * 2줄로도 넘치면 글자 크기를 줄인다.
 */
export function splitFriendQrCardName(
  name: string,
  measure: (text: string) => number,
  maxWidth: number,
): string[] {
  const chars = Array.from(name);
  if (measure(name) <= maxWidth || chars.length < 2) return [name];
  const mid = Math.ceil(chars.length / 2);
  const spaceNear = name.lastIndexOf(" ", name.length / 2 + 4);
  if (spaceNear > 0 && Math.abs(spaceNear - name.length / 2) <= 4) {
    return [name.slice(0, spaceNear), name.slice(spaceNear + 1)];
  }
  return [chars.slice(0, mid).join(""), chars.slice(mid).join("")];
}

/** 이미지 저장·공유용 PNG — 화면 카드와 같은 구성: QR(가운데 내 사진) + 이름 + @아이디 (재감사 Q11) */
export async function renderFriendQrCardPng(args: {
  url: string;
  name: string;
  atId: string | null;
  avatarUrl?: string | null;
}): Promise<Blob> {
  const W = 720;
  const H = 960;
  const QR = 560;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = FRIEND_QR_LIGHT;
  ctx.fillRect(0, 0, W, H);
  const qrTop = 60;
  ctx.drawImage(await loadImage(await renderFriendQrDataUrl(args.url, QR)), (W - QR) / 2, qrTop, QR, QR);

  /** 가운데 사진 — 화면과 같은 비율(QR 폭의 22%), 흰 테두리. 사진을 못 불러오면(CORS 등) 사진 없이 */
  if (args.avatarUrl) {
    try {
      const av = await loadImage(args.avatarUrl, true);
      const d = Math.round(QR * 0.22);
      const cx = W / 2;
      const cy = qrTop + QR / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2 + 8, 0, Math.PI * 2);
      ctx.fillStyle = FRIEND_QR_LIGHT;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(av, cx - d / 2, cy - d / 2, d, d);
      ctx.restore();
      ctx.getImageData(0, 0, 1, 1); // 외부 사진으로 캔버스가 막혔으면 여기서 오류 → 사진 없이 다시
    } catch {
      return renderFriendQrCardPng({ ...args, avatarUrl: null });
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const maxText = W - 80;
  let size = 40;
  let lines: string[] = [];
  for (; size >= 28; size -= 2) {
    ctx.font = `700 ${size}px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif`;
    lines = splitFriendQrCardName(args.name, (s) => ctx.measureText(s).width, maxText);
    if (lines.every((l) => ctx.measureText(l).width <= maxText)) break;
  }
  ctx.fillStyle = "#16201a";
  let y = qrTop + QR + 70;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += Math.round(size * 1.3);
  }
  if (args.atId) {
    ctx.fillStyle = FRIEND_QR_DARK;
    ctx.font = '600 32px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.fillText(args.atId, W / 2, y + 6);
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png_failed"))), "image/png");
  });
}
