export const ADMIN_BOARD_SKIN_TYPES = ["basic", "gallery", "magazine", "qna", "promo"] as const;
export type AdminBoardSkinType = (typeof ADMIN_BOARD_SKIN_TYPES)[number];

export const ADMIN_BOARD_CATEGORY_MODES = ["none", "trade_category", "board_category"] as const;
export type AdminBoardCategoryMode = (typeof ADMIN_BOARD_CATEGORY_MODES)[number];

export type CreateAdminBoardInput = {
  service_id: string;
  name: string;
  slug: string;
  description: string | null;
  skin_type: AdminBoardSkinType;
  form_type: AdminBoardSkinType;
  category_mode: AdminBoardCategoryMode;
  is_active: boolean;
  sort_order: number;
  policy: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v.trim());
}

function pickEnum<T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] {
  if (typeof v !== "string") return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

/** slug: URL용, 소문자·숫자·하이픈 */
export function normalizeBoardSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseCreateBoardBody(body: unknown): { ok: true; data: CreateAdminBoardInput } | { ok: false; error: string } {
  if (body == null || typeof body !== "object") return { ok: false, error: "invalid_body" };

  const o = body as Record<string, unknown>;
  const service_id = typeof o.service_id === "string" ? o.service_id.trim() : "";
  if (!isUuid(service_id)) return { ok: false, error: "invalid_service_id" };

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (name.length < 1 || name.length > 120) return { ok: false, error: "invalid_name" };

  const slug = normalizeBoardSlug(typeof o.slug === "string" ? o.slug : "");
  if (slug.length < 1 || slug.length > 64) return { ok: false, error: "invalid_slug" };

  let description: string | null = null;
  if (o.description != null) {
    if (typeof o.description !== "string") return { ok: false, error: "invalid_description" };
    const t = o.description.trim();
    if (t.length > 500) return { ok: false, error: "invalid_description" };
    description = t.length > 0 ? t : null;
  }

  const skin_type = pickEnum(o.skin_type, ADMIN_BOARD_SKIN_TYPES, "basic");
  const form_type = pickEnum(o.form_type, ADMIN_BOARD_SKIN_TYPES, "basic");
  const category_mode = pickEnum(o.category_mode, ADMIN_BOARD_CATEGORY_MODES, "none");

  const is_active = o.is_active === false ? false : true;

  let sort_order = 0;
  if (o.sort_order != null) {
    const n = Number(o.sort_order);
    if (!Number.isFinite(n) || n < 0 || n > 99999) return { ok: false, error: "invalid_sort_order" };
    sort_order = Math.round(n);
  }

  const policy =
    o.policy != null && typeof o.policy === "object" && !Array.isArray(o.policy)
      ? (o.policy as Record<string, unknown>)
      : { allow_comment: true, allow_like: true, allow_report: true };

  return {
    ok: true,
    data: {
      service_id,
      name,
      slug,
      description,
      skin_type,
      form_type,
      category_mode,
      is_active,
      sort_order,
      policy,
    },
  };
}
