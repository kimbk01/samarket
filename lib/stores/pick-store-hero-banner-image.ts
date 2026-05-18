import { isScheduleRowActive } from "@/lib/stores/store-banners-notices-public";

export type StoreBannerImagePickRow = {
  image_url: string;
  sort_order?: number | null;
  id?: string;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
};

/** `store_banners` — sort_order·id 순 첫 활성 배너 이미지 URL */
export function pickFirstActiveStoreBannerImageUrl(rows: StoreBannerImagePickRow[]): string | null {
  const sorted = [...rows].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  for (const r of sorted) {
    if (!isScheduleRowActive(r)) continue;
    const u = r.image_url?.trim();
    if (u) return u;
  }
  return null;
}

export function mapFirstStoreBannerImageByStoreId(
  rows: (StoreBannerImagePickRow & { store_id: string })[]
): Map<string, string> {
  const grouped = new Map<string, StoreBannerImagePickRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.store_id) ?? [];
    arr.push(r);
    grouped.set(r.store_id, arr);
  }
  const out = new Map<string, string>();
  for (const [storeId, arr] of grouped) {
    const url = pickFirstActiveStoreBannerImageUrl(arr);
    if (url) out.set(storeId, url);
  }
  return out;
}
