"use client";

/**
 * 광고 운영 › 충전·문의 (설계 ads-admin-ssot-design-2026-11-07 §2 · §5 · 2026-11-07).
 * 광고주 충전 요청(회원 포인트 · 매장 비즈니스 캐시)과 광고 문의(고객센터 · 광고 참조 종류별)를 한 곳에서 연다.
 * 처리는 각 화면(권한 그대로: 포인트 = point · 캐시 = business · 문의 = support). 권한이 없으면 꺼짐 + 이유.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { actorMeetsAdminRouteRequirement, type AdminRouteRequirement } from "@/lib/admin/access/admin-route-access";
import {
  ADS_LEDGER_SUPPORT_REFERENCE_TYPES,
  SUPPORT_FILTERABLE_AD_REFERENCE_TYPES,
  adsLedgerSupportHref,
} from "@/lib/admin/ads-ledger/ad-ledger-presentation";
import { ledgerText } from "@/lib/admin/ads-ledger/ledger-text";

type HubLink = { id: string; label: string; href: string; requirement: AdminRouteRequirement };

export function AdminAdsChargeInquiryHub() {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const { actor } = useAdminAccessActor();
  const groups: Array<{ id: string; title: string; links: HubLink[] }> = [
    {
      id: "charge",
      title: t("ads_ledger_col_payment"),
      links: [
        { id: "point", label: t("ads_ledger_ci_point"), href: "/admin/point-charges", requirement: { kind: "permission", key: "point" } },
        { id: "cash", label: t("ads_ledger_ci_cash"), href: "/admin/delivery-ads/cash-charges", requirement: { kind: "permission", key: "business" } },
      ],
    },
    {
      id: "support",
      title: t("ads_ledger_ci_support"),
      // 고객센터가 거를 수 있는 종류만 (거를 수 없는 종류를 넣으면 전체 목록이 열려 「광고 문의」가 아니게 된다)
      links: ADS_LEDGER_SUPPORT_REFERENCE_TYPES.filter((r) => SUPPORT_FILTERABLE_AD_REFERENCE_TYPES.has(r.type)).map((r) => ({
        id: r.type,
        label: ledgerText(r.labelKey, ko),
        href: adsLedgerSupportHref({ type: r.type }),
        requirement: { kind: "permission", key: "support" } as AdminRouteRequirement,
      })),
    },
  ];
  return (
    <div className="space-y-4 p-4" data-admin-ads-charge-inquiry-hub="1">
      <AdminPageHeader titleKey="admin_menu_ads_charge_inquiry" description={t("ads_ledger_ci_desc")} />
      {groups.map((g) => (
        <section key={g.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <h2 className="mb-2 text-[13px] font-semibold text-sam-fg">{g.title}</h2>
          <div className="flex flex-wrap gap-2">
            {g.links.map((l) =>
              actor && actorMeetsAdminRouteRequirement(l.requirement, actor) ? (
                <AdminActionLink key={l.id} href={l.href} size="sm" data-admin-ads-charge-inquiry-link={l.id}>
                  {l.label}
                </AdminActionLink>
              ) : (
                <span key={l.id} className="inline-flex flex-col">
                  <AdminActionButton size="sm" disabled aria-disabled="true">
                    {l.label}
                  </AdminActionButton>
                  <span className="text-[12px] text-sam-muted">
                    {t("ads_ledger_sc_need_perm", {
                      key: l.requirement.kind === "permission" ? l.requirement.key : l.requirement.kind,
                    })}
                  </span>
                </span>
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
