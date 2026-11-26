"use client";

/**
 * 광고 요금 안내 표 — 공지 고정 게시물 화면 · 고객센터 「광고 금액 확인」이 같이 쓴다 (광고 감사 E).
 * 시안: docs/audit/ad-pricing-notice-mockup-2026-11-26.html ②③. 데이터 = `GET /api/ads/pricing-guide`(결제 창과 같은 표).
 */
import { Fragment } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdPricingGroup, AdPricingGuide } from "@/lib/ads/ad-pricing-guide";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { useIosAppDigitalPurchaseBlocked } from "@/lib/apple-iap/use-ios-digital-purchase-blocked";

export type AdPricingGuideTab = "member" | "store";

function GroupRows({
  group,
  amountText,
}: {
  group: AdPricingGroup;
  amountText: (n: number) => string;
}) {
  const { t } = useI18n();
  return (
    <>
      {group.options.map((o, i) => (
        <tr key={`${group.id}-${o.days}-${i}`} className={i === 0 ? "border-t border-sam-border" : ""}>
          {i === 0 ? (
            <>
              <td rowSpan={group.options.length} className="px-2 py-2 align-top text-[12px] font-bold text-sam-fg">
                {t(group.nameKey)}
              </td>
              <td rowSpan={group.options.length} className="px-2 py-2 align-top text-[11px] text-sam-muted">
                {t(group.whereKey)}
              </td>
            </>
          ) : null}
          <td className="whitespace-nowrap px-2 py-2 text-[12px] text-sam-fg">
            {o.days === 1 ? t("ad_guide_day_one") : t("ad_guide_days", { days: String(o.days) })}
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-right text-[12px] font-bold tabular-nums text-sam-fg">
            {amountText(o.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function AdPricingGuideTable({
  guide,
  tab,
  onTabChange,
}: {
  guide: AdPricingGuide;
  tab: AdPricingGuideTab;
  onTabChange: (tab: AdPricingGuideTab) => void;
}) {
  const { t, language } = useI18n();
  const iosBlocked = useIosAppDigitalPurchaseBlocked();
  const points = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString(language === "en" ? "en-US" : "ko-KR")}P`;
  const php = (minor: number) => formatDeliveryAdPhpMinor(minor);
  const groups = tab === "member" ? guide.member : guide.store;
  const partner = tab === "store" ? guide.partner : null;
  const empty = groups.length === 0 && !partner;

  return (
    <div data-ad-pricing-guide={tab}>
      <div className="flex rounded-t-ui-rect border border-b-0 border-sam-border bg-sam-surface" role="tablist">
        {(["member", "store"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            data-ad-pricing-tab={k}
            onClick={() => onTabChange(k)}
            className={`min-h-11 flex-1 border-b-2 text-[14px] font-bold ${
              tab === k ? "border-sam-primary text-sam-primary" : "border-transparent text-sam-muted"
            }`}
          >
            {t(k === "member" ? "ad_guide_tab_member" : "ad_guide_tab_store")}
          </button>
        ))}
      </div>
      {empty ? (
        <p className="border border-sam-border bg-sam-surface px-3 py-6 text-center text-[13px] text-sam-muted">
          {t("ad_guide_empty")}
        </p>
      ) : (
        <table className="w-full border-collapse border border-sam-border bg-sam-surface">
          <thead>
            <tr className="bg-sam-app text-left text-[11px] font-semibold text-sam-muted">
              <th className="px-2 py-1.5">{t("ad_guide_col_ad")}</th>
              <th className="px-2 py-1.5">{t("ad_guide_col_where")}</th>
              <th className="whitespace-nowrap px-2 py-1.5">{t("ad_guide_col_period")}</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right">{t("ad_guide_col_amount")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.id}>
                <GroupRows group={g} amountText={tab === "member" ? points : php} />
              </Fragment>
            ))}
            {partner ? (
              <tr className="border-t border-sam-border" data-ad-pricing-partner="1">
                <td className="px-2 py-2 align-top text-[12px] font-bold text-sam-fg">{t("ad_guide_name_partner")}</td>
                <td className="px-2 py-2 align-top text-[11px] text-sam-muted">
                  {t("ad_guide_where_partner", { pct: String(partner.discountPercent) })}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-[12px] text-sam-fg">{t("ad_guide_monthly")}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-[12px] font-bold tabular-nums text-sam-fg">
                  {php(partner.feeMinor)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
      <ul className="list-disc space-y-1 rounded-b-ui-rect border border-t-0 border-sam-border bg-sam-surface py-2.5 pl-7 pr-3 text-[12px] leading-relaxed text-sam-fg">
        {tab === "member" ? (
          <>
            <li>{t("ad_guide_note_member_start")}</li>
            <li>{t("ad_guide_note_member_boost_rule")}</li>
          </>
        ) : (
          <li>{t("ad_guide_note_store_start")}</li>
        )}
        <li>{t("ad_guide_note_fixed")}</li>
      </ul>
      {tab === "store" && iosBlocked ? (
        <p className="mt-2 rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-fg">
          {t("owner_ios_cash_purchase_unavailable")}
        </p>
      ) : null}
    </div>
  );
}
