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

/** 이미지 저장용 PNG — QR + 이름 + @아이디 */
export async function renderFriendQrCardPng(args: {
  url: string;
  name: string;
  atId: string | null;
}): Promise<Blob> {
  const W = 720;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = FRIEND_QR_LIGHT;
  ctx.fillRect(0, 0, W, H);
  const qr = await renderFriendQrDataUrl(args.url, 560);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("qr_image_failed"));
    el.src = qr;
  });
  ctx.drawImage(img, (W - 560) / 2, 60, 560, 560);
  ctx.textAlign = "center";
  ctx.fillStyle = "#362415";
  ctx.font = "700 40px system-ui, -apple-system, sans-serif";
  ctx.fillText(args.name, W / 2, 700);
  if (args.atId) {
    ctx.fillStyle = FRIEND_QR_DARK;
    ctx.font = "600 32px system-ui, -apple-system, sans-serif";
    ctx.fillText(args.atId, W / 2, 752);
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png_failed"))), "image/png");
  });
}
