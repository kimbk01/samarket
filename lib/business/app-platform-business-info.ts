/**
 * Slice 8 Phase 2 — Platform Business Info CMS helpers.
 * Separate authority from Legal (app_legal_documents) and Notices (app_notices).
 */

export const APP_BUSINESS_LOCALES = ["ko", "en"] as const;
export type AppBusinessLocale = (typeof APP_BUSINESS_LOCALES)[number];

export const APP_BUSINESS_STATUSES = ["draft", "published"] as const;
export type AppBusinessStatus = (typeof APP_BUSINESS_STATUSES)[number];

export const APP_BUSINESS_INFO_SELECT =
  "id, locale, company_name, representative_name, registration_number, mail_order_number, address, email, phone, version, status, published_at, created_at, updated_at";

export type AppPlatformBusinessInfoRow = {
  id: string;
  locale: AppBusinessLocale;
  companyName: string;
  representativeName: string;
  registrationNumber: string;
  mailOrderNumber: string;
  address: string;
  email: string;
  phone: string;
  version: string;
  status: AppBusinessStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isAppBusinessLocale(v: unknown): v is AppBusinessLocale {
  return v === "ko" || v === "en";
}

export function isMissingAppPlatformBusinessInfoTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("app_platform_business_info") &&
    (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))
  );
}

export function normalizeAppPlatformBusinessInfoRow(
  row: Record<string, unknown>,
): AppPlatformBusinessInfoRow | null {
  const id = String(row.id ?? "").trim();
  const locale = String(row.locale ?? "").trim();
  if (!id || !isAppBusinessLocale(locale)) return null;
  const statusRaw = String(row.status ?? "draft").trim();
  return {
    id,
    locale,
    companyName: String(row.company_name ?? ""),
    representativeName: String(row.representative_name ?? ""),
    registrationNumber: String(row.registration_number ?? ""),
    mailOrderNumber: String(row.mail_order_number ?? ""),
    address: String(row.address ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    version: String(row.version ?? ""),
    status: statusRaw === "published" ? "published" : "draft",
    publishedAt: row.published_at != null ? String(row.published_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function pickPublishedBusinessInfo(
  rows: AppPlatformBusinessInfoRow[],
): AppPlatformBusinessInfoRow | null {
  const published = rows.filter((r) => r.status === "published");
  if (!published.length) return null;
  published.sort((a, b) => {
    const ap = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bp = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bp - ap;
  });
  return published[0] ?? null;
}
