"use client";

/**
 * D-10 · D-11 (2026-11-07) — 진행 중 상위노출이 걸린 게시글을 숨기거나 지울 때 귀책 선택.
 * 서버가 `promotion_fault_required` 를 돌려주면(또는 화면이 이미 상위노출을 알면) 시트 안에 보인다.
 * 상위노출 종료와 글 변경은 DB 함수 1번(`admin_community_post_moderate`)에서 함께 처리된다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type CommunityPromotionFault = "" | "operator" | "member";

export function CommunityPromotionFaultPicker({
  value,
  onChange,
  name = "promotion-fault",
}: {
  value: CommunityPromotionFault;
  onChange: (next: Exclude<CommunityPromotionFault, "">) => void;
  name?: string;
}) {
  const { t } = useI18n();
  return (
    <fieldset
      className="space-y-1 rounded-ui-rect border border-sam-border p-2 text-[13px]"
      data-community-promotion-fault-picker="1"
    >
      <legend className="px-1 font-semibold text-sam-fg">{t("admin_ads_w3_promotion_fault_legend")}</legend>
      <p className="text-[12px] text-sam-muted">{t("admin_ads_w3_promotion_fault_note")}</p>
      <label className="flex items-center gap-2">
        <input type="radio" name={name} checked={value === "operator"} onChange={() => onChange("operator")} />
        {t("admin_ads_w3_promotion_fault_operator")}
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name={name} checked={value === "member"} onChange={() => onChange("member")} />
        {t("admin_ads_w3_promotion_fault_member")}
      </label>
    </fieldset>
  );
}
