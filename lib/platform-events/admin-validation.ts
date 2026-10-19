/**
 * Admin Event editor — save-time validation shared by the editor (client) and
 * `POST/PATCH /api/admin/platform-events` (server). Pure module.
 *
 * Every CTA (primary + section CTAs) must resolve through the popup CTA validator AND the
 * Scope B destination contract (`parseDestinationHref`), so what the admin saves is exactly
 * what `openDestination` will open.
 */
import { parseDestinationHref } from "@/lib/destination/destination-contract";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { normalizePlatformEventSections } from "@/lib/platform-events/sections";
import { PLATFORM_EVENT_CATEGORY_MAX } from "@/lib/platform-events/types";

export const PLATFORM_EVENT_SORT_ORDER_MIN = -100000;
export const PLATFORM_EVENT_SORT_ORDER_MAX = 100000;

export type PlatformEventCtaCheck =
  | { ok: true; href: string }
  | { ok: false; error: string };

export function validatePlatformEventCtaDestination(input: {
  ctaType?: string | null;
  ctaTarget?: string | null;
  externalUrl?: string | null;
}): PlatformEventCtaCheck {
  const ctaType = String(input.ctaType ?? "").trim();
  if (!ctaType) return { ok: false, error: "cta_missing" };
  if (ctaType === "event_detail") return { ok: false, error: "event_detail_loop_forbidden" };
  const v = validatePlatformPopupCta({
    ctaType,
    ctaTarget: input.ctaTarget ?? "",
    externalUrl: input.externalUrl ?? null,
  });
  if (!v.ok) return { ok: false, error: v.error };
  const dest = parseDestinationHref(v.value.href);
  if (!dest.ok) return { ok: false, error: dest.error };
  return { ok: true, href: v.value.href };
}

/** First invalid CTA section (sections are normalized first, same as the writer). */
export function validatePlatformEventSectionCtas(
  rawSections: unknown
): { ok: true } | { ok: false; error: string; index: number } {
  const sections = normalizePlatformEventSections(rawSections);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.type !== "cta") continue;
    const v = validatePlatformEventCtaDestination({
      ctaType: s.ctaType,
      ctaTarget: s.ctaTarget,
      externalUrl: s.externalUrl,
    });
    if (!v.ok) return { ok: false, error: `section_cta_${v.error}`, index: i };
  }
  return { ok: true };
}

export type PlatformEventBoardFieldPatch = {
  thumbnail_url?: string | null;
  sort_order?: number;
  is_pinned?: boolean;
  category?: string | null;
};

function has(body: Record<string, unknown>, camel: string, snake: string): boolean {
  return body[camel] !== undefined || body[snake] !== undefined;
}

function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  return body[camel] !== undefined ? body[camel] : body[snake];
}

/** Board columns from an admin body (camelCase or snake_case). Only provided keys are returned. */
export function parsePlatformEventBoardFields(
  body: Record<string, unknown>
): { ok: true; patch: PlatformEventBoardFieldPatch } | { ok: false; error: string } {
  const patch: PlatformEventBoardFieldPatch = {};
  if (has(body, "thumbnailUrl", "thumbnail_url")) {
    const url = String(pick(body, "thumbnailUrl", "thumbnail_url") ?? "").trim();
    if (url && !/^https:\/\//i.test(url)) return { ok: false, error: "thumbnail_url_invalid" };
    patch.thumbnail_url = url || null;
  }
  if (has(body, "sortOrder", "sort_order")) {
    const raw = pick(body, "sortOrder", "sort_order");
    const n = raw === null || raw === "" ? 0 : Number(raw);
    if (
      !Number.isInteger(n) ||
      n < PLATFORM_EVENT_SORT_ORDER_MIN ||
      n > PLATFORM_EVENT_SORT_ORDER_MAX
    ) {
      return { ok: false, error: "sort_order_invalid" };
    }
    patch.sort_order = n;
  }
  if (has(body, "isPinned", "is_pinned")) {
    const raw = pick(body, "isPinned", "is_pinned");
    if (typeof raw !== "boolean") return { ok: false, error: "is_pinned_invalid" };
    patch.is_pinned = raw;
  }
  if (has(body, "category", "category")) {
    const c = String(body.category ?? "").trim();
    if (c.length > PLATFORM_EVENT_CATEGORY_MAX) return { ok: false, error: "category_too_long" };
    patch.category = c || null;
  }
  return { ok: true, patch };
}

/** starts_at must be before ends_at (DB CHECK) — reject early with a readable error. */
export function validatePlatformEventSchedule(
  startsAt: unknown,
  endsAt: unknown
): { ok: true } | { ok: false; error: string } {
  const a = startsAt ? Date.parse(String(startsAt)) : NaN;
  const b = endsAt ? Date.parse(String(endsAt)) : NaN;
  if (startsAt && !Number.isFinite(a)) return { ok: false, error: "starts_at_invalid" };
  if (endsAt && !Number.isFinite(b)) return { ok: false, error: "ends_at_invalid" };
  if (Number.isFinite(a) && Number.isFinite(b) && a >= b) {
    return { ok: false, error: "schedule_range_invalid" };
  }
  return { ok: true };
}

/** Lifecycle actions that require a confirm dialog in the editor. */
export const PLATFORM_EVENT_LIFECYCLE_ACTIONS = ["publish", "unpublish", "archive"] as const;
export type PlatformEventLifecycleAction = (typeof PLATFORM_EVENT_LIFECYCLE_ACTIONS)[number];

/**
 * DB patch for a lifecycle action. Archive also unpublishes so every existing status-only gate
 * (popup, banner, push source) stops distributing it even before `archived_at` exists.
 */
export function platformEventLifecyclePatch(
  action: PlatformEventLifecycleAction,
  nowIso: string
): Record<string, unknown> {
  if (action === "publish") return { status: "published", published_at: nowIso, archived_at: null };
  if (action === "unpublish") return { status: "unpublished" };
  return { status: "unpublished", archived_at: nowIso };
}

export function isPlatformEventLifecycleAction(v: unknown): v is PlatformEventLifecycleAction {
  return (PLATFORM_EVENT_LIFECYCLE_ACTIONS as readonly string[]).includes(String(v));
}

const ADMIN_ERROR_KO: Record<string, string> = {
  title_required: "이벤트 제목을 입력해 주세요.",
  cta_missing: "이동 유형을 선택해 주세요.",
  event_detail_loop_forbidden: "이벤트 CTA는 다른 이벤트 상세로 연결할 수 없습니다.",
  destination_id_required: "이동할 대상을 설정해 주세요.",
  external_url_required: "외부 URL을 입력해 주세요.",
  internal_path_required: "이동할 앱 내부 경로(/로 시작)를 입력해 주세요.",
  internal_path_forbidden: "관리자·사장님 화면으로는 연결할 수 없습니다.",
  invalid_internal_path: "앱 내부 경로 형식이 올바르지 않습니다.",
  invalid_url: "URL 형식이 올바르지 않습니다.",
  invalid_url_scheme: "허용되지 않는 URL입니다.",
  https_required: "외부 링크는 https:// 로 시작해야 합니다.",
  destination_empty: "이동할 대상을 설정해 주세요.",
  thumbnail_url_invalid: "썸네일 이미지는 https:// 주소여야 합니다.",
  sort_order_invalid: "정렬 순서는 정수로 입력해 주세요.",
  is_pinned_invalid: "상단 고정 값이 올바르지 않습니다.",
  category_too_long: `카테고리는 ${PLATFORM_EVENT_CATEGORY_MAX}자 이내로 입력해 주세요.`,
  schedule_range_invalid: "노출 종료는 노출 시작 이후여야 합니다.",
  starts_at_invalid: "노출 시작 일시가 올바르지 않습니다.",
  ends_at_invalid: "노출 종료 일시가 올바르지 않습니다.",
};

/** Operator-facing message for an editor/API error code. */
export function platformEventAdminErrorMessage(code: string, lang: "ko" | "en" = "ko"): string {
  const base = code.startsWith("section_cta_") ? code.slice("section_cta_".length) : code;
  if (lang === "en") return code.startsWith("section_cta_") ? `Section CTA: ${base}` : base;
  const msg = ADMIN_ERROR_KO[base] ?? "입력값을 확인해 주세요.";
  return code.startsWith("section_cta_") ? `섹션 버튼: ${msg}` : msg;
}
