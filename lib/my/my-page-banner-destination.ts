/**
 * DS-7 · C-1 (Owner 「설계안대로」 2026-11-04) — 마이 배너 목적지 규칙 (단일 정의).
 * - 저장: 앱 안 경로·이벤트만, **링크 필수**(외부 https · 빈칸 거부) — `validateMyPageBannerLinkForSave`
 * - 노출: 링크가 없거나 형식이 틀린 배너, **끝난(또는 비공개) 이벤트로 가는 배너**는 고객에게 보내지 않는다 —
 *   `filterMyPageBannersWithLiveDestination` (이벤트 확인 = 팝업과 같은 `loadPopupEventDestinationLookups`)
 * - 운영에 이미 저장된 외부 링크 행은 데이터를 바꾸지 않는다(그대로 노출 · Owner 판단 대기).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { destinationHref, parseDestinationHref } from "@/lib/destination/destination-contract";
import { loadPopupEventDestinationLookups } from "@/lib/platform-popup/popup-event-destination-availability";

export type MyPageBannerLinkSaveError = "link_required" | "external_link_forbidden" | "invalid_link";

export function validateMyPageBannerLinkForSave(
  raw: unknown
): { ok: true; href: string } | { ok: false; error: MyPageBannerLinkSaveError } {
  const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!s) return { ok: false, error: "link_required" };
  const parsed = parseDestinationHref(s);
  if (!parsed.ok) {
    return { ok: false, error: /^[a-z][a-z0-9+.-]*:/i.test(s) ? "external_link_forbidden" : "invalid_link" };
  }
  if (parsed.ref.kind === "external_url") return { ok: false, error: "external_link_forbidden" };
  return { ok: true, href: destinationHref(parsed.ref) };
}

/** 노출 단계: 링크가 열 수 있는 목적지인지 + 이벤트면 지금 공개·진행 중인지. 조회 실패 = 이벤트 배너 제외(fail-closed) */
export async function filterMyPageBannersWithLiveDestination<T extends { link_url?: string | null }>(
  sb: SupabaseClient,
  rows: readonly T[],
  nowMs: number = Date.now()
): Promise<T[]> {
  const parsedRows = rows.map((row) => ({ row, parsed: parseDestinationHref(String(row.link_url ?? "")) }));
  const eventIds = parsedRows
    .map((r) => (r.parsed.ok && r.parsed.ref.kind === "event" ? r.parsed.ref.eventId : null))
    .filter((id): id is string => Boolean(id));
  const lookups = eventIds.length ? await loadPopupEventDestinationLookups(sb, eventIds, nowMs) : new Map();
  return parsedRows
    .filter(({ parsed }) => {
      if (!parsed.ok) return false;
      if (parsed.ref.kind !== "event") return true;
      const l = lookups.get(parsed.ref.eventId);
      return Boolean(l && l.exists && l.visible && !l.expired);
    })
    .map((r) => r.row);
}

/** 저장 거부 코드(`invalid_target_url:<code>`) → 운영자 문구. 마이 배너 링크 오류가 아니면 null */
export function myPageBannerLinkErrorMessage(raw: string | null | undefined, ko: boolean): string | null {
  const code = String(raw ?? "").trim();
  if (!code.startsWith("invalid_target_url:")) return null;
  const reason = code.slice("invalid_target_url:".length);
  if (reason === "link_required") {
    return ko ? "누르면 이동할 링크를 입력해 주세요(앱 안 경로 또는 이벤트)." : "Enter where the banner goes (in-app path or event).";
  }
  if (reason === "external_link_forbidden") {
    return ko
      ? "마이 배너는 외부 링크를 쓸 수 없습니다. 앱 안 경로(/…) 또는 이벤트(/events/…)를 넣어 주세요."
      : "My-page banners cannot use external links. Use an in-app path (/…) or an event (/events/…).";
  }
  return ko ? "링크 형식이 올바르지 않습니다. /로 시작하는 앱 안 경로를 넣어 주세요." : "Invalid link. Use an in-app path starting with /.";
}
