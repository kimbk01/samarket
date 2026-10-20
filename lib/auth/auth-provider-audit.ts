import type { AuthProviderRow } from "@/lib/auth/auth-providers";

/** 감사 로그용 — client_secret 원문은 절대 저장하지 않는다(설정 여부만 `***`). */
export function maskAuthProviderForAudit(
  row: Pick<
    AuthProviderRow,
    "provider" | "enabled" | "client_id" | "client_secret" | "redirect_uri" | "scope" | "sort_order"
  >
): Record<string, unknown> {
  return {
    provider: row.provider,
    enabled: row.enabled,
    client_id: row.client_id,
    client_secret: String(row.client_secret ?? "").trim().length > 0 ? "***" : "",
    redirect_uri: row.redirect_uri,
    scope: row.scope,
    sort_order: row.sort_order,
  };
}
