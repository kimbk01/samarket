"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_GIFT_OPS_TABS,
  buildAdminGiftOpsHref,
  parseAdminGiftOpsMoneySubtab,
  parseAdminGiftOpsProductsSubtab,
  parseAdminGiftOpsTab,
  type AdminGiftOpsTab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { AdminGiftAuditPanel } from "@/components/admin/gift/panels/AdminGiftAuditPanel";
import { AdminGiftInstancesPanel } from "@/components/admin/gift/panels/AdminGiftInstancesPanel";
import { AdminGiftIssuancePanel } from "@/components/admin/gift/panels/AdminGiftIssuancePanel";
import { AdminGiftMoneyPanel } from "@/components/admin/gift/panels/AdminGiftMoneyPanel";
import { AdminGiftRecoveryPanel } from "@/components/admin/gift/panels/AdminGiftRecoveryPanel";
import { AdminGiftRedemptionsPanel } from "@/components/admin/gift/panels/AdminGiftRedemptionsPanel";
import { AdminGiftRevenuePanel } from "@/components/admin/gift/panels/AdminGiftRevenuePanel";
import { AdminGiftSummaryPanel } from "@/components/admin/gift/panels/AdminGiftSummaryPanel";

const TAB_LABEL: Record<
  AdminGiftOpsTab,
  { ko: string; en: string }
> = {
  summary: { ko: "운영 요약", en: "Summary" },
  products: { ko: "발급·상품", en: "Issuance" },
  instances: { ko: "상품권 현황", en: "Instances" },
  redemptions: { ko: "사용 내역", en: "Usage" },
  revenue: { ko: "매장 정산·수익", en: "Settlement" },
  money: { ko: "환전·전환", en: "Money" },
  recovery: { ko: "Recovery", en: "Recovery" },
  audit: { ko: "감사 이력", en: "Audit" },
};

export function AdminGiftOpsCenter() {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const tab = parseAdminGiftOpsTab(sp.get("tab"));
  const id = sp.get("id")?.trim() ?? "";
  const productsSubRaw = parseAdminGiftOpsProductsSubtab(sp.get("products"));
  const productsSub =
    id && sp.get("products") == null ? ("products" as const) : productsSubRaw;
  const moneySub = parseAdminGiftOpsMoneySubtab(sp.get("money"));
  const q = sp.get("q")?.trim() ?? "";
  const status = sp.get("status")?.trim() ?? "";
  const storeId = sp.get("storeId")?.trim() ?? "";
  const create = sp.get("create") === "1";
  const createType = (sp.get("type")?.trim() ?? "").toUpperCase();
  const scopeFilter = (sp.get("scope")?.trim() ?? "ALL").toUpperCase();
  const range = sp.get("range")?.trim() ?? "all";
  const filter = sp.get("filter")?.trim() ?? "all";
  const event = sp.get("event")?.trim() ?? "";
  const number = sp.get("number")?.trim() ?? "";

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4" data-admin-gift-ops-center="1">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-sam-fg">
          {safeT("gift_ops_center_title", {
            fallbackKo: "상품권 관리",
            fallbackEn: "Gift Operations",
          })}
        </h1>
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_center_desc", {
            fallbackKo: "발급부터 사용·수익·환전·Recovery까지 한곳에서 운영합니다.",
            fallbackEn: "Operate issuance through redemption, revenue, cash-out, and recovery in one place.",
          })}
        </p>
      </div>

      <nav
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        aria-label={safeT("gift_ops_tabs_label", {
          fallbackKo: "상품권 관리 탭",
          fallbackEn: "Gift operations tabs",
        })}
        data-admin-gift-ops-tabs="1"
      >
        {ADMIN_GIFT_OPS_TABS.map((t) => {
          const active = t === tab;
          const href = buildAdminGiftOpsHref({
            tab: t,
            products: t === "products" ? productsSub : undefined,
            money: t === "money" ? moneySub : undefined,
          });
          return (
            <Link
              key={t}
              href={href}
              data-admin-gift-ops-tab={t}
              data-active={active ? "1" : "0"}
              className={[
                "shrink-0 rounded-ui-rect px-3 py-2 text-sm font-semibold whitespace-nowrap",
                active
                  ? "bg-sam-fg text-sam-app"
                  : "border border-sam-border bg-sam-surface text-sam-fg",
              ].join(" ")}
            >
              {safeT(`gift_ops_tab_${t}`, {
                fallbackKo: TAB_LABEL[t].ko,
                fallbackEn: TAB_LABEL[t].en,
              })}
            </Link>
          );
        })}
      </nav>

      {tab === "summary" ? <AdminGiftSummaryPanel range={range} /> : null}
      {tab === "products" ? (
        <AdminGiftIssuancePanel
          productsSubtab={productsSub}
          id={id}
          create={create}
          storeId={storeId}
          scopeFilter={scopeFilter}
          createType={createType}
        />
      ) : null}
      {tab === "instances" ? (
        <AdminGiftInstancesPanel id={id || number} q={q} status={status} />
      ) : null}
      {tab === "redemptions" ? (
        <AdminGiftRedemptionsPanel filter={filter} q={q} />
      ) : null}
      {tab === "revenue" ? <AdminGiftRevenuePanel storeId={storeId} /> : null}
      {tab === "money" ? (
        <AdminGiftMoneyPanel moneySubtab={moneySub} id={id} status={status} />
      ) : null}
      {tab === "recovery" ? <AdminGiftRecoveryPanel id={id} /> : null}
      {tab === "audit" ? <AdminGiftAuditPanel q={q} event={event} /> : null}
    </div>
  );
}
