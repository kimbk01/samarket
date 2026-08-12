/**
 * Customer Center Content SSOT — physical table remains `app_notices`.
 * Campaigns = delivery copy; notification_events = Bell/read-state.
 */

export const CUSTOMER_CENTER_CONTENT_TYPES = ["notice", "system", "marketing"] as const;

export type CustomerCenterContentType = (typeof CUSTOMER_CENTER_CONTENT_TYPES)[number];

export const DEFAULT_AUTHOR_LABEL: Record<CustomerCenterContentType, { ko: string; en: string }> = {
  notice: { ko: "DIBAY 운영팀", en: "DIBAY Ops" },
  system: { ko: "DIBAY 시스템", en: "DIBAY System" },
  marketing: { ko: "DIBAY", en: "DIBAY" },
};

export const BOARD_LABEL: Record<CustomerCenterContentType, { ko: string; en: string }> = {
  notice: { ko: "공지", en: "Notice" },
  system: { ko: "시스템", en: "System" },
  marketing: { ko: "마케팅", en: "Marketing" },
};

export function isCustomerCenterContentType(value: unknown): value is CustomerCenterContentType {
  return value === "notice" || value === "system" || value === "marketing";
}

export function parseCustomerCenterContentType(
  value: unknown,
  fallback: CustomerCenterContentType = "notice"
): CustomerCenterContentType {
  return isCustomerCenterContentType(value) ? value : fallback;
}

/** Member-facing author — never admin UUID/email. */
export function resolveCustomerCenterAuthorLabel(input: {
  contentType: CustomerCenterContentType;
  authorLabel?: string | null;
  language?: "ko" | "en";
}): string {
  const override = typeof input.authorLabel === "string" ? input.authorLabel.trim() : "";
  if (override) return override;
  const lang = input.language === "en" ? "en" : "ko";
  return DEFAULT_AUTHOR_LABEL[input.contentType][lang];
}

export type CustomerCenterContentRow = {
  id: string;
  content_type: CustomerCenterContentType;
  title: string;
  body: string;
  hero_image_url: string | null;
  author_label: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  view_count: number;
  comment_enabled: boolean;
  comment_count: number;
  archived_at: string | null;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const APP_NOTICES_CONTENT_SELECT =
  "id, content_type, title, body, hero_image_url, author_label, is_active, starts_at, ends_at, published_at, view_count, comment_count, comment_enabled, archived_at, deleted_at, created_by, created_at, updated_at";

export function isCustomerCenterContentPublishedNow(row: {
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
}): boolean {
  if (row.deleted_at || row.archived_at) return false;
  if (!row.is_active) return false;
  const now = Date.now();
  if (row.starts_at) {
    const t = Date.parse(String(row.starts_at));
    if (Number.isFinite(t) && t > now) return false;
  }
  if (row.ends_at) {
    const t = Date.parse(String(row.ends_at));
    if (Number.isFinite(t) && t < now) return false;
  }
  return true;
}

export function customerCenterContentUnavailableFallback(language: "ko" | "en" = "ko"): string {
  return language === "en"
    ? "This notice has ended or is no longer available."
    : "이 안내는 종료되었거나 더 이상 제공되지 않습니다.";
}
