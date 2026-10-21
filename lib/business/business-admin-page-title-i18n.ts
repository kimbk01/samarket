import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerNavMatch } from "@/lib/business/owner-nav-registry";

function ownerAdminTitle(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key).toLocaleUpperCase();
}

/**
 * 오너 셸 헤더 제목 — 4단계 IA-09: `owner-nav-registry` 의 `titleKey` 에서만 파생 (라벨 = 제목 단일 키).
 * 허브(`/stores/owner`)는 매장명 헤더라 null. 미등록 경로는 기본 「매장 어드민」.
 */
export function getBusinessAdminPageTitleI18n(
  pathname: string,
  search?: string | null
): string | null {
  const qs =
    search != null && String(search).length > 0
      ? String(search).replace(/^\?/, "")
      : pathname.includes("?")
        ? (pathname.split("?")[1] ?? "")
        : "";
  const match = resolveOwnerNavMatch(pathname, qs);
  if (match?.entry.id === "dashboard") return null;
  if (match) return ownerAdminTitle(match.entry.titleKey);
  return ownerAdminTitle("biz_title_default");
}
