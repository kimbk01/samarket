export type StoreBannerPublicRow = {
  id: string;
  image_url: string;
  title: string | null;
  description: string | null;
  link_type: string;
  link_target_id: string | null;
  sort_order: number;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
};

export type StoreNoticePublicRow = {
  id: string;
  title: string;
  body: string;
  images_json: unknown;
  placement: string;
  sort_order: number;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
};

export function isScheduleRowActive(row: {
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
}): boolean {
  if (row.is_active === false) return false;
  const now = Date.now();
  const s = row.start_at;
  if (typeof s === "string" && s.trim()) {
    const t = new Date(s.trim()).getTime();
    if (Number.isFinite(t) && t > now) return false;
  }
  const e = row.end_at;
  if (typeof e === "string" && e.trim()) {
    const t = new Date(e.trim()).getTime();
    if (Number.isFinite(t) && t <= now) return false;
  }
  return true;
}

export function parseNoticeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const u = typeof x === "string" ? x.trim() : "";
    if (u) out.push(u);
    if (out.length >= 3) break;
  }
  return out;
}
