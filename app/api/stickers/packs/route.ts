import { NextResponse } from "next/server";
import { listStickerPacksForApi } from "@/lib/stickers/sticker-catalog-db";

export const revalidate = 600;

/** 패크 목록만 — 스티커 이미지는 로드하지 않음 */
export async function GET() {
  const packs = await listStickerPacksForApi();
  return NextResponse.json({ ok: true as const, packs }, { headers: { "Cache-Control": "private, max-age=300" } });
}
