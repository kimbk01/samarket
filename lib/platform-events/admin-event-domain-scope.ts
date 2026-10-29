import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminDomainScope } from "@/lib/admin/list-query/admin-domain-scope";
import { loadPlatformPopupDomainCampaignIds } from "@/lib/platform-popup/admin-campaign-loader";

/**
 * 재감사 B (G-06 · 2026-10-30 Owner 승인): 이벤트 목록 `?domain=` — 이벤트 원장에는 도메인 열이 없으므로
 * 이미 있는 노출 값으로 판정한다 (원장 변경 없음).
 * - 배너 배포 `config.domain` 이 그 도메인
 * - 연결된 팝업 캠페인의 노출 위치가 그 도메인 (`loadPlatformPopupDomainCampaignIds` — 전체 노출 GLOBAL 포함)
 * - 배달: 매장 출처 이벤트(`source_store_id`) · 매장 이동(`cta_type = store`)
 * 어느 도메인 신호도 없는 이벤트 = 전체 노출 → 모든 도메인 결과에 포함 (팝업의 GLOBAL 과 같은 규칙).
 */
export async function loadPlatformEventIdsForDomainScope(
  sb: SupabaseClient,
  scope: AdminDomainScope
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const [eventsRes, distRes, popupInScope] = await Promise.all([
    sb.from("platform_events").select("id, source_store_id, cta_type"),
    sb
      .from("platform_promotion_distributions")
      .select("content_id, channel_ref_type, channel_ref_id, config")
      .eq("content_type", "platform_event"),
    loadPlatformPopupDomainCampaignIds(sb, scope),
  ]);
  if (eventsRes.error) return { ok: false, error: eventsRes.error.message };
  if (distRes.error) return { ok: false, error: distRes.error.message };
  if (!popupInScope.ok) return popupInScope;
  const popupIdsInScope = new Set(popupInScope.ids);

  const signaled = new Set<string>();
  const matched = new Set<string>();
  for (const e of (eventsRes.data ?? []) as { id: string; source_store_id?: string | null; cta_type?: string | null }[]) {
    if (e.source_store_id || e.cta_type === "store") {
      signaled.add(e.id);
      if (scope === "delivery") matched.add(e.id);
    }
  }
  for (const d of (distRes.data ?? []) as {
    content_id: string;
    channel_ref_type?: string | null;
    channel_ref_id?: string | null;
    config?: { domain?: unknown } | null;
  }[]) {
    const domain = typeof d.config?.domain === "string" ? d.config.domain : "";
    if (domain) {
      signaled.add(d.content_id);
      if (domain === scope) matched.add(d.content_id);
    }
    if (d.channel_ref_type === "platform_popup_campaign" && d.channel_ref_id) {
      signaled.add(d.content_id);
      if (popupIdsInScope.has(d.channel_ref_id)) matched.add(d.content_id);
    }
  }
  const ids = ((eventsRes.data ?? []) as { id: string }[])
    .map((e) => e.id)
    .filter((id) => matched.has(id) || !signaled.has(id));
  return { ok: true, ids };
}
