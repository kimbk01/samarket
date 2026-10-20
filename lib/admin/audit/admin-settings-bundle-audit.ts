import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

/**
 * 내부 운영 도구 번들(admin_settings JSON) 저장 감사 요약.
 * 번들 전체를 감사 로그에 복사하지 않고 크기·최상위 키별 개수만 남긴다.
 */
export function summarizeAdminSettingsBundleForAudit(bundle: unknown): Record<string, unknown> {
  let bytes = 0;
  try {
    bytes = JSON.stringify(bundle ?? null).length;
  } catch {
    bytes = -1;
  }
  const shape: Record<string, number | string> = {};
  if (bundle != null && typeof bundle === "object" && !Array.isArray(bundle)) {
    for (const [k, v] of Object.entries(bundle as Record<string, unknown>)) {
      if (Array.isArray(v)) shape[k] = v.length;
      else if (v != null && typeof v === "object") shape[k] = "object";
      else if (typeof v === "number" || typeof v === "boolean") shape[k] = String(v);
      else shape[k] = typeof v;
    }
  }
  return { bytes, shape };
}

/** PUT 성공 이후 호출 — target_type = 번들 키, action = `<tool>.update`. best-effort. */
export async function appendAdminSettingsBundleAudit(
  sb: SupabaseClient,
  req: Request,
  input: { actorId: string; settingsKey: string; tool: string; bundle: unknown }
): Promise<void> {
  await appendAdminRouteAudit(sb, req, {
    actorId: input.actorId,
    targetType: input.settingsKey,
    targetId: input.settingsKey,
    action: `${input.tool}.update`,
    after: summarizeAdminSettingsBundleForAudit(input.bundle),
  });
}
