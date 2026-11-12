"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ConsentLegalDocSheet } from "@/components/legal/ConsentLegalDocSheet";
import {
  formatPartnerFeePercent,
  type StorePartnerTermsOffer,
} from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  DIBAY_ONBOARDING_CHECKBOX_CLASS,
  DIBAY_ONBOARDING_LABEL_CLASS,
  DIBAY_ONBOARDING_LINK_CLASS,
} from "@/lib/ui/dibay-onboarding-styles";

/**
 * 매장 입점·수수료 서약 — 조건 줄 + 체크 2개 (입점 신청서 · 사장님 재동의 시트 공용).
 * 조건 값(무료 종료일·요율)은 서버가 계산한 `offer` 그대로 보여 준다 — 화면에서 계산하지 않는다.
 */
export function StorePartnerPledgeFields({
  offer,
  categoryLabel,
  agreeTerms,
  agreeFee,
  onChange,
  disabled = false,
}: {
  offer: StorePartnerTermsOffer;
  /** 요율이 걸린 업종 이름 (신청서 선택값 · 매장 업종) */
  categoryLabel: string;
  agreeTerms: boolean;
  agreeFee: boolean;
  onChange: (next: { agreeTerms: boolean; agreeFee: boolean }) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const terms = offer.terms;
  const doc = useMemo(
    () => (terms ? { title: terms.title, body: terms.body, version: terms.version } : null),
    [terms]
  );
  const percent = formatPartnerFeePercent(offer.feePercentAfter);
  const category = categoryLabel.trim() || "—";

  return (
    <div className="space-y-3" data-store-partner-pledge="1">
      <ul className="space-y-1 rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted px-3 py-2.5 sam-text-body text-sam-fg">
        {offer.freePromoActive && offer.freeUntil ? (
          <li className="font-semibold text-sam-primary">{t("partner_free_until_line", { date: offer.freeUntil })}</li>
        ) : null}
        <li>
          {!percent
            ? t("partner_fee_unknown")
            : offer.freePromoActive
              ? t("partner_fee_after_free_line", { category, percent })
              : t("partner_fee_line", { category, percent })}
        </li>
        {terms ? (
          <li className="sam-text-helper text-sam-muted">{t("partner_terms_version", { version: terms.version })}</li>
        ) : null}
      </ul>
      <label className="flex min-h-[44px] items-start gap-3">
        <input
          type="checkbox"
          checked={agreeTerms}
          disabled={disabled}
          onChange={(e) => onChange({ agreeTerms: e.target.checked, agreeFee })}
          className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
        />
        <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
          {t("partner_agree_terms_label")}{" "}
          <button type="button" className={DIBAY_ONBOARDING_LINK_CLASS} onClick={() => setSheetOpen(true)}>
            {t("partner_view_terms_btn")}
          </button>
        </span>
      </label>
      <label className="flex min-h-[44px] items-start gap-3">
        <input
          type="checkbox"
          checked={agreeFee}
          disabled={disabled}
          onChange={(e) => onChange({ agreeTerms, agreeFee: e.target.checked })}
          className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
        />
        <span className={DIBAY_ONBOARDING_LABEL_CLASS}>{t("partner_agree_fee_label")}</span>
      </label>
      <ConsentLegalDocSheet
        open={sheetOpen}
        kind="store_partner_terms"
        document={doc}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
