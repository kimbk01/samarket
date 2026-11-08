/**
 * 커뮤니티 포인트 내역 표시 라벨 (설계 §C-13) — 원장 유형·종류를 카탈로그 키로. Client-safe.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

export const COMMUNITY_POINT_TYPE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_community_point_type_all" },
  { value: "community_reward", labelKey: "admin_community_point_type_reward" },
  { value: "community_reclaim", labelKey: "admin_community_point_type_reclaim" },
  { value: "promotion_order", labelKey: "admin_community_point_type_promotion" },
  { value: "admin_manual", labelKey: "admin_community_point_type_admin_manual" },
];

const RELATED: Record<string, MessageKey> = {
  community_reward: "admin_community_point_type_reward",
  community_reclaim: "admin_community_point_type_reclaim",
  promotion_order: "admin_community_point_related_promotion",
  admin_manual: "admin_community_point_related_admin",
};

const ENTRY: Record<string, MessageKey> = {
  reward: "admin_community_point_entry_grant",
  reverse: "admin_community_point_entry_reclaim",
  spend: "admin_community_point_entry_spend",
  refund: "admin_community_point_entry_refund",
  admin_credit: "admin_community_point_entry_grant",
  admin_debit: "admin_community_point_entry_reclaim",
  admin_adjust: "admin_community_point_entry_adjust",
  charge: "admin_community_point_entry_charge",
  expire: "admin_community_point_entry_expire",
};

/** `lang` 생략 시 한국어(기존 호출부 동작 유지). */
export function communityPointTypeLabel(
  relatedType: string | null | undefined,
  entryType: string | null | undefined,
  lang: string = "ko"
): string {
  const r = translateBy(lang, RELATED[String(relatedType ?? "")] ?? "admin_community_point_related_other");
  const entryKey = ENTRY[String(entryType ?? "")];
  return entryKey ? `${r} ${translateBy(lang, entryKey)}` : r;
}
