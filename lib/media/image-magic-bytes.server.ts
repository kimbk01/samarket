import sharp from "sharp";
import { isHeicOrHeifBuffer } from "@/lib/media/heic-decode.server";

/** 이미지 형식을 파일 내용(매직 바이트)으로 판정 — 클라이언트·원격 서버가 보낸 MIME 은 신뢰하지 않는다. */
export function detectImageMimeFromBytes(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const t = buf.toString("ascii", 3, 6);
    if (t === "87a" || t === "89a") return "image/gif";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (isHeicOrHeifBuffer(buf)) return "image/heic";
  return null;
}

/** GIF 는 재인코딩 없이 원본을 저장하므로 실제로 디코딩되는 GIF 인지 확인한다 (CM-P2-14). */
export async function isDecodableGif(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf, { animated: true, limitInputPixels: COMMUNITY_IMAGE_MAX_INPUT_PIXELS }).metadata();
    return meta.format === "gif" && (meta.width ?? 0) > 0 && (meta.height ?? 0) > 0;
  } catch {
    return false;
  }
}

/** 디코딩 폭탄 방지 상한 — 100MP(폰 사진 최대 48~50MP 의 2배) */
export const COMMUNITY_IMAGE_MAX_INPUT_PIXELS = 100_000_000;
