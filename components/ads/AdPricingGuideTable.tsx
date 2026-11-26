"use client";

/**
 * 광고 요금 안내 — 공지 고정 게시물 화면 · 고객센터 「광고 금액 확인」이 같이 쓴다 (광고 감사 E).
 * 재감사 2026-11-27 (Owner 「칸에서 다 벗어나고 … 뭘 어찌 하라는 건지」) — 시안 `docs/audit/ad-pricing-guide-redesign-mockup-2026-11-27.html`:
 *  - G-1·G-3: 4칸 한 표 → 광고마다 카드(이름 · 나오는 곳 + 시작 배지 · 기간/금액 2칸 표). 이름은 낱말 단위로만 줄바꿈.
 *  - G-2: 광고마다 「신청하기 ›」(실제 결제 화면) + 위 3단계 안내.
 *  - G-4: 앱 시작 팝업·당김 광고 = 「운영팀과 상의 · 금액 문의」.
 *  - G-5: 탭은 스크롤해도 위에 고정(sticky).
 *  - ₱ 는 정수(₱350) — 센타보가 있을 때만 소수.
 * 데이터 = `GET /api/ads/pricing-guide`(결제 창과 같은 표).
 */
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AD_PRICING_INQUIRY_ADS,
  type AdPricingGroup,
  type AdPricingGuide,
  type AdPricingOption,
} from "@/lib/ads/ad-pricing-guide";
import { useIosAppDigitalPurchaseBlocked } from "@/lib/apple-iap/use-ios-digital-purchase-blocked";

export type AdPricingGuideTab = "member" | "store";

/** ₱ 표기 — 센타보가 0 이면 정수(₱350), 아니면 소수 2자리 */
export function formatAdGuidePhpMinor(minor: number): string {
  const v = Math.max(0, Math.trunc(minor));
  const whole = v % 100 === 0;
  return `₱${(v / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

function PriceTable({
  options,
  amountText,
}: {
  options: readonly AdPricingOption[];
  amountText: (n: number) => string;
}) {
  const { t } = useI18n();
  return (
    <table className="mx-3 mb-3 w-[calc(100%-1.5rem)] table-fixed border-collapse text-[13px]">
      <colgroup>
        <col className="w-[38%]" />
        <col />
      </colgroup>
      <thead>
        <tr className="bg-sam-app text-[11.5px] text-sam-muted">
          <th className="border border-sam-border px-2 py-1.5 text-left font-semibold">{t("ad_guide_col_period")}</th>
          <th className="border border-sam-border px-2 py-1.5 text-right font-semibold">{t("ad_guide_col_amount")}</th>
        </tr>
      </thead>
      <tbody>
        {options.map((o, i) => (
          <tr key={`${o.days}-${i}`}>
            <td className="whitespace-nowrap border border-sam-border px-2 py-2 text-sam-fg">
              {o.days === 1 ? t("ad_guide_day_one") : t("ad_guide_days", { days: String(o.days) })}
            </td>
            <td className="whitespace-nowrap border border-sam-border px-2 py-2 text-right text-[14px] font-bold tabular-nums text-sam-fg">
              {amountText(o.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AdCard({
  name,
  where,
  start,
  applyHref,
  applyLabel,
  options,
  amountText,
  testId,
}: {
  name: string;
  where: string;
  start?: string | null;
  applyHref?: string | null;
  applyLabel: string;
  options?: readonly AdPricingOption[];
  amountText: (n: number) => string;
  testId: string;
}) {
  return (
    <section className="border border-t-0 border-sam-border bg-sam-surface" data-ad-pricing-card={testId}>
      <div className="flex items-start justify-between gap-2 px-3 pb-1 pt-3">
        <h3 className="min-w-0 break-keep text-[15px] font-bold leading-snug text-sam-fg">{name}</h3>
        {applyHref ? (
          <Link
            href={applyHref}
            className="shrink-0 rounded-ui-rect bg-sam-primary px-2.5 py-1.5 text-[12px] font-bold text-sam-on-primary"
            data-ad-pricing-apply={testId}
          >
            {applyLabel}
          </Link>
        ) : applyLabel ? (
          <span className="shrink-0 text-[13px] font-bold text-sam-primary">{applyLabel}</span>
        ) : null}
      </div>
      <p className="break-keep px-3 pb-2 text-[12px] leading-relaxed text-sam-muted">
        {where}
        {start ? (
          <span className="ml-1 inline-block rounded-ui-rect bg-sam-primary-soft px-1.5 py-px text-[11px] font-bold text-sam-primary">
            {start}
          </span>
        ) : null}
      </p>
      {options && options.length > 0 ? <PriceTable options={options} amountText={amountText} /> : null}
    </section>
  );
}

export function AdPricingGuideTable({
  guide,
  tab,
  onTabChange,
  showApply = true,
}: {
  guide: AdPricingGuide;
  tab: AdPricingGuideTab;
  onTabChange: (tab: AdPricingGuideTab) => void;
  /** 「신청하기 ›」 — 고객센터 문의 창 안에서는 끈다(문의 흐름 유지) */
  showApply?: boolean;
}) {
  const { t, language } = useI18n();
  const iosBlocked = useIosAppDigitalPurchaseBlocked();
  const points = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString(language === "en" ? "en-US" : "ko-KR")}P`;
  const php = (minor: number) => formatAdGuidePhpMinor(minor);
  const groups: readonly AdPricingGroup[] = tab === "member" ? guide.member : guide.store;
  const partner = tab === "store" ? guide.partner : null;
  const amountText = tab === "member" ? points : php;

  return (
    <div data-ad-pricing-guide={tab}>
      {/* G-5: 스크롤해도 탭은 위에 */}
      <div
        className="sticky top-0 z-[2] flex rounded-t-ui-rect border border-sam-border bg-sam-surface"
        role="tablist"
      >
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

      {/* G-2: 무엇을 하면 되는지 — 고르기 → 결제 → 시작 */}
      <ol className="flex gap-1.5 border border-t-0 border-sam-border bg-sam-surface px-3 py-2.5 text-[11.5px] leading-snug">
        {(tab === "member"
          ? (["ad_guide_step_pick", "ad_guide_step_pay_points", "ad_guide_step_start_member"] as const)
          : (["ad_guide_step_pick", "ad_guide_step_pay_cash", "ad_guide_step_start_store"] as const)
        ).map((k, i) => (
          <li key={k} className="flex-1 break-keep rounded-ui-rect bg-sam-app px-1.5 py-1.5 text-center text-sam-fg">
            <b className="block text-sam-primary">{i + 1}</b>
            {t(k)}
          </li>
        ))}
      </ol>

      {groups.length === 0 && !partner ? (
        <p className="border border-t-0 border-sam-border bg-sam-surface px-3 py-6 text-center text-[13px] text-sam-muted">
          {t("ad_guide_empty")}
        </p>
      ) : null}

      {groups.map((g) => (
        <AdCard
          key={g.id}
          testId={g.id}
          name={t(g.nameKey)}
          where={t(g.whereKey)}
          start={t(g.startKey)}
          applyHref={showApply ? g.applyHref : null}
          applyLabel={showApply ? t("ad_guide_apply") : ""}
          options={g.options}
          amountText={amountText}
        />
      ))}

      {partner ? (
        <AdCard
          testId="partner"
          name={t("ad_guide_name_partner")}
          where={t("ad_guide_where_partner", { pct: String(partner.discountPercent) })}
          applyHref={showApply ? partner.applyHref : null}
          applyLabel={showApply ? t("ad_guide_join") : ""}
          options={[{ days: partner.days, amount: partner.feeMinor }]}
          amountText={php}
        />
      ) : null}

      {/* G-4: 앱 시작 팝업·당김 광고 — 앱 결제 경로 없음 → 운영팀 문의 */}
      <p className="border border-t-0 border-sam-border bg-sam-app px-3 pb-1.5 pt-3 text-[12.5px] font-bold text-sam-muted">
        {t("ad_guide_inquiry_section")}
      </p>
      {AD_PRICING_INQUIRY_ADS.map((a) => (
        <AdCard
          key={a.id}
          testId={a.id}
          name={t(a.nameKey)}
          where={t(a.whereKey)}
          applyLabel={t("ad_guide_price_inquiry")}
          amountText={amountText}
        />
      ))}

      <ul className="list-disc space-y-1 rounded-b-ui-rect border border-t-0 border-sam-border bg-sam-surface py-2.5 pl-7 pr-3 text-[12px] leading-relaxed text-sam-fg">
        {tab === "member" ? (
          <li>{t("ad_guide_note_member_boost_rule")}</li>
        ) : guide.storeHomeFeedOff ? (
          <li>{t("ad_guide_note_store_home_feed_off")}</li>
        ) : null}
        <li>{t("ad_guide_note_fixed")}</li>
        <li>{t("ad_guide_note_inquiry_ads")}</li>
      </ul>
      {tab === "store" && iosBlocked ? (
        <p className="mt-2 rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-fg">
          {t("owner_ios_cash_purchase_unavailable")}
        </p>
      ) : null}
    </div>
  );
}
