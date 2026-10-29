/**
 * HS-07 — 관리자 「추천 매장」 설정 (순수 · 서버/클라이언트/테스트 공용).
 * 기존 컬럼만 쓴다: `stores.is_featured` · `featured_start_at` · `featured_end_at` (스키마 변경 없음).
 * 단건 PATCH `set_store_featured` 와 일괄 `set_featured` 가 같은 해석을 쓴다.
 */

export type AdminStoreFeaturedPatch = {
  is_featured: boolean;
  featured_start_at: string | null;
  featured_end_at: string | null;
};

function parseIsoOrNull(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const t = v.trim();
  if (!t) return { ok: true, value: null };
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return { ok: false };
  return { ok: true, value: new Date(ms).toISOString() };
}

/**
 * 본문 → stores 패치. 추천 끄기면 기간도 비운다.
 * 오류 코드: `enabled_required` · `featured_period_invalid` · `featured_period_order`.
 */
export function parseAdminStoreFeaturedPatch(body: {
  enabled?: unknown;
  featured_start_at?: unknown;
  featured_end_at?: unknown;
}):
  | { ok: true; patch: AdminStoreFeaturedPatch }
  | { ok: false; error: "enabled_required" | "featured_period_invalid" | "featured_period_order" } {
  if (typeof body.enabled !== "boolean") return { ok: false, error: "enabled_required" };
  if (!body.enabled) {
    return { ok: true, patch: { is_featured: false, featured_start_at: null, featured_end_at: null } };
  }
  const start = parseIsoOrNull(body.featured_start_at);
  const end = parseIsoOrNull(body.featured_end_at);
  if (!start.ok || !end.ok) return { ok: false, error: "featured_period_invalid" };
  if (start.value && end.value && Date.parse(end.value) <= Date.parse(start.value)) {
    return { ok: false, error: "featured_period_order" };
  }
  return {
    ok: true,
    patch: { is_featured: true, featured_start_at: start.value, featured_end_at: end.value },
  };
}

/** `<input type="date">` 값(YYYY-MM-DD, 마닐라 날짜) → ISO. 시작은 그날 00:00, 종료는 그날 23:59:59 (UTC+8). */
export function manilaDateInputToIso(date: string, edge: "start" | "end"): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
  if (!m) return null;
  const time = edge === "start" ? "00:00:00" : "23:59:59";
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${time}+08:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ISO → `<input type="date">` 값 (마닐라 날짜). */
export function isoToManilaDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}
