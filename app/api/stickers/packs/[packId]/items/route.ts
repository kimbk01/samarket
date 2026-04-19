import { NextResponse } from "next/server";
import { listStickerItemsForPack } from "@/lib/stickers/sticker-catalog-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 단일 패크의 아이템만 — 탭 선택 시 1회 */
export async function GET(_req: Request, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const items = await listStickerItemsForPack(String(packId ?? ""));
  return NextResponse.json({ ok: true as const, items }, { headers: { "Cache-Control": "private, max-age=300" } });
}
