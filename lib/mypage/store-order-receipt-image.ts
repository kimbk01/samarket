/**
 * 주문 내역서 이미지 (v2.1 S32) — 외부 라이브러리 없이 캔버스에 직접 그린다.
 * 행 단위 텍스트만 그리므로 화면 DOM·폰트 로딩과 무관하게 같은 결과.
 */
export type ReceiptImageLine =
  | { kind: "title"; text: string }
  | { kind: "text"; text: string; muted?: boolean }
  | { kind: "row"; left: string; right: string; bold?: boolean }
  | { kind: "divider" }
  | { kind: "gap" };

const WIDTH = 720;
const PAD = 40;
const FONT = '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", Roboto, sans-serif';

function lineHeight(line: ReceiptImageLine): number {
  switch (line.kind) {
    case "title":
      return 56;
    case "divider":
      return 24;
    case "gap":
      return 12;
    default:
      return 34;
  }
}

/** 긴 문구를 폭에 맞춰 줄바꿈(글자 단위 — 한글·영문 공통) */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export async function renderReceiptImage(lines: ReceiptImageLine[]): Promise<Blob> {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("canvas_unavailable");
  measure.font = `24px ${FONT}`;
  const expanded: ReceiptImageLine[] = [];
  for (const l of lines) {
    if (l.kind === "text") {
      for (const part of wrap(measure, l.text, WIDTH - PAD * 2)) expanded.push({ ...l, text: part });
    } else {
      expanded.push(l);
    }
  }

  const height = PAD * 2 + expanded.reduce((s, l) => s + lineHeight(l), 0);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = "middle";

  let y = PAD;
  for (const l of expanded) {
    const h = lineHeight(l);
    const mid = y + h / 2;
    if (l.kind === "title") {
      ctx.fillStyle = "#0B421A";
      ctx.font = `bold 32px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(l.text, WIDTH / 2, mid);
    } else if (l.kind === "text") {
      ctx.fillStyle = l.muted ? "#6B7280" : "#111827";
      ctx.font = `24px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(l.text, PAD, mid);
    } else if (l.kind === "row") {
      ctx.fillStyle = "#111827";
      ctx.font = `${l.bold ? "bold " : ""}24px ${FONT}`;
      ctx.textAlign = "right";
      const rightWidth = ctx.measureText(l.right).width;
      ctx.fillText(l.right, WIDTH - PAD, mid);
      ctx.textAlign = "left";
      const leftParts = wrap(ctx, l.left, WIDTH - PAD * 2 - rightWidth - 16);
      ctx.fillText(leftParts.length > 1 ? `${leftParts[0]}…` : (leftParts[0] ?? ""), PAD, mid);
    } else if (l.kind === "divider") {
      ctx.strokeStyle = "#D1D5DB";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(PAD, mid);
      ctx.lineTo(WIDTH - PAD, mid);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    y += h;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png_failed"))), "image/png");
  });
}

/** 공유 시트(파일 공유 지원 시) → 아니면 PNG 내려받기 */
export async function shareOrSaveReceiptImage(blob: Blob, fileName: string, title: string): Promise<"shared" | "saved"> {
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return "saved";
}
