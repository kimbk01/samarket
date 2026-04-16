import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  FALLBACK_STICKER_ITEMS,
  FALLBACK_STICKER_PACKS,
  type FallbackStickerItem,
  type FallbackStickerPack,
} from "@/lib/stickers/fallback-sticker-catalog";
import type { StickerItemDto, StickerPackDto } from "@/lib/stickers/sticker-dto";

export type { StickerItemDto, StickerPackDto };

function mapPack(row: {
  id: string;
  slug: string;
  name: string;
  icon_url: string;
  sort_order: number;
}): StickerPackDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    iconUrl: row.icon_url,
    sortOrder: row.sort_order,
  };
}

function mapItem(row: {
  id: string;
  pack_id: string;
  file_url: string;
  keyword: string;
  sort_order: number;
}): StickerItemDto {
  return {
    id: row.id,
    packId: row.pack_id,
    fileUrl: row.file_url,
    keyword: row.keyword,
    sortOrder: row.sort_order,
  };
}

export async function listStickerPacksForApi(): Promise<StickerPackDto[]> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("sticker_packs")
      .select("id, slug, name, icon_url, sort_order")
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return FALLBACK_STICKER_PACKS;
    return (data as Parameters<typeof mapPack>[0][]).map(mapPack);
  } catch {
    return FALLBACK_STICKER_PACKS;
  }
}

function fallbackItemsForDbPackSlug(slug: string, realPackId: string): StickerItemDto[] {
  const mapSlug: Record<string, string> = { basic: "fallback-basic", reaction: "fallback-reaction" };
  const fbPack = mapSlug[slug];
  if (!fbPack) return [];
  return FALLBACK_STICKER_ITEMS.filter((i) => i.packId === fbPack).map((i) => ({
    ...i,
    id: `${realPackId}:${i.keyword}`,
    packId: realPackId,
  }));
}

export async function listStickerItemsForPack(packId: string): Promise<StickerItemDto[]> {
  const pid = packId.trim();
  if (!pid) return [];
  if (pid === "fallback-basic" || pid === "fallback-reaction") {
    return FALLBACK_STICKER_ITEMS.filter((i) => i.packId === pid);
  }
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("sticker_items")
      .select("id, pack_id, file_url, keyword, sort_order")
      .eq("pack_id", pid)
      .order("sort_order", { ascending: true });
    if (!error && data?.length) {
      return (data as Parameters<typeof mapItem>[0][]).map(mapItem);
    }
    const { data: packMeta } = await sb.from("sticker_packs").select("slug").eq("id", pid).maybeSingle();
    const slug = String((packMeta as { slug?: string } | null)?.slug ?? "").trim();
    if (slug) {
      const fb = fallbackItemsForDbPackSlug(slug, pid);
      if (fb.length) return fb;
    }
    return FALLBACK_STICKER_ITEMS.filter((i) => i.packId === pid);
  } catch {
    return FALLBACK_STICKER_ITEMS.filter((i) => i.packId === pid);
  }
}
