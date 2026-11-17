/**
 * 진입 감사 PO-9 (2026-11-17): 팝업 소재 저장소 누수 정리.
 *
 * 운영 실측: `platform-popup-creatives` 78개 중 10개가 어디에도 연결되지 않은 파일이었다
 * (8개는 삭제된 캠페인, 2개는 교체 실패·교체 전 파일). 원인 = 업로드 뒤 연결 실패·캠페인 삭제·사장님 신청 소재 교체 때
 * 파일을 지우지 않음.
 *
 * 규칙: **어떤 행도 참조하지 않는 경로만** 지운다 — 캠페인 소재(`platform_popup_creatives.asset_path`)와
 * 사장님 신청(`platform_popup_owner_requests.creative_asset_path`) 둘 다 확인. 확인 실패 시 지우지 않는다(fail-safe).
 * 지우기 실패는 화면 동작에 영향 없음(기록만).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PLATFORM_POPUP_CREATIVES_BUCKET = "platform-popup-creatives";

export async function removeUnreferencedPopupCreativeFiles(
  sb: SupabaseClient,
  paths: ReadonlyArray<string | null | undefined>,
  reason: string
): Promise<{ removed: string[] }> {
  const candidates = [...new Set(paths.map((p) => String(p ?? "").trim()).filter(Boolean))];
  if (candidates.length === 0) return { removed: [] };
  const [creatives, requests] = await Promise.all([
    sb.from("platform_popup_creatives").select("asset_path").in("asset_path", candidates),
    sb.from("platform_popup_owner_requests").select("creative_asset_path").in("creative_asset_path", candidates),
  ]);
  if (creatives.error || requests.error) {
    console.error("[platform-popup/storage-cleanup] reference_check_failed", reason);
    return { removed: [] };
  }
  const referenced = new Set<string>([
    ...((creatives.data ?? []) as { asset_path: string | null }[]).map((r) => String(r.asset_path ?? "")),
    ...((requests.data ?? []) as { creative_asset_path: string | null }[]).map((r) => String(r.creative_asset_path ?? "")),
  ]);
  const removable = candidates.filter((p) => !referenced.has(p));
  if (removable.length === 0) return { removed: [] };
  const { error } = await sb.storage.from(PLATFORM_POPUP_CREATIVES_BUCKET).remove(removable);
  if (error) {
    console.error("[platform-popup/storage-cleanup] remove_failed", reason, error.message);
    return { removed: [] };
  }
  return { removed: removable };
}
