"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_GIFT_OPS_TABS,
  buildAdminGiftOpsHref,
  parseAdminGiftOpsFinanceSubtab,
  parseAdminGiftOpsLedgerSubtab,
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

const TAB_LABEL: Record<AdminGiftOpsTab, { ko: string; en: string }> = {
  dashboard: { ko: "대시보드", en: "Dashboard" },
  products: { ko: "상품 관리", en: "Products" },
  instances: { ko: "발급 상품권", en: "Issued certificates" },
  ledger: { ko: "사용·정산", en: "Usage & settlement" },
  finance: { ko: "환전·복구", en: "Conversion & recovery" },
  audit: { ko: "감사", en: "Audit" },
};

export function AdminGiftOpsCenter() {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const rawTab = sp.get("tab");
  const tab = parseAdminGiftOpsTab(rawTab);
  const id = sp.get("id")?.trim() ?? "";
  const productsSubRaw = parseAdminGiftOpsProductsSubtab(sp.get("products"));
  const productsSub =
    id && sp.get("products") == null && tab === "products"
      ? ("products" as const)
      : productsSubRaw;
  const ledgerSub = parseAdminGiftOpsLedgerSubtab(sp.get("ledger"), rawTab);
  const financeSub = parseAdminGiftOpsFinanceSubtab(sp.get("finance"), sp.get("money"), rawTab);
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
  const balance = sp.get("balance")?.trim() ?? "";
  const focus = sp.get("focus")?.trim() ?? "";
  const pane = sp.get("pane")?.trim() ?? "";

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
            fallbackKo: "상품·발급·사용·정산·환전·복구를 업무 기준으로 운영합니다.",
            fallbackEn: "Operate products, issued certificates, usage, settlement, and recovery by workflow.",
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
            ledger: t === "ledger" ? ledgerSub : undefined,
            finance: t === "finance" ? financeSub : undefined,
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
              {safeT(
                (
                  {
                    dashboard: "gift_ops_tab_dashboard",
                    products: "gift_ops_tab_products",
                    instances: "gift_ops_tab_instances",
                    ledger: "gift_ops_tab_ledger",
                    finance: "gift_ops_tab_finance",
                    audit: "gift_ops_tab_audit",
                  } as const
                )[t],
                {
                  fallbackKo: TAB_LABEL[t].ko,
                  fallbackEn: TAB_LABEL[t].en,
                }
              )}
            </Link>
          );
        })}
      </nav>

      {tab === "dashboard" ? <AdminGiftSummaryPanel range={range} /> : null}
      {tab === "products" ? (
        <AdminGiftIssuancePanel
          productsSubtab={productsSub}
          id={id}
          create={create}
          storeId={storeId}
          scopeFilter={scopeFilter}
          createType={createType}
          pane={pane}
        />
      ) : null}
      {tab === "instances" ? (
        <AdminGiftInstancesPanel
          id={id || number}
          q={q}
          status={status}
          balance={balance}
          focus={focus}
        />
      ) : null}
      {tab === "ledger" ? (
        <div className="space-y-3" data-admin-gift-ledger="1">
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildAdminGiftOpsHref({ tab: "ledger", ledger: "usage" })}
              className={[
                "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
                ledgerSub === "usage" ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
              ].join(" ")}
              data-admin-gift-ledger-sub="usage"
            >
              {safeT("gift_ops_ledger_usage", { fallbackKo: "사용 내역", fallbackEn: "Usage" })}
            </Link>
            <Link
              href={buildAdminGiftOpsHref({ tab: "ledger", ledger: "settlement" })}
              className={[
                "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
                ledgerSub === "settlement" ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
              ].join(" ")}
              data-admin-gift-ledger-sub="settlement"
            >
              {safeT("gift_ops_ledger_settlement", {
                fallbackKo: "매장·Platform 정산",
                fallbackEn: "Settlement",
              })}
            </Link>
          </div>
          {ledgerSub === "usage" ? <AdminGiftRedemptionsPanel filter={filter} q={q} /> : null}
          {ledgerSub === "settlement" ? <AdminGiftRevenuePanel storeId={storeId} /> : null}
        </div>
      ) : null}
      {tab === "finance" ? (
        <div className="space-y-3" data-admin-gift-finance="1">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "external" as const, ko: "과거 외부 환전", en: "Historical cash-out" },
                { id: "store-cash" as const, ko: "과거 전환 기록", en: "Historical conversion records" },
                { id: "recovery" as const, ko: "Recovery", en: "Recovery" },
              ] as const
            ).map((s) => (
              <Link
                key={s.id}
                href={buildAdminGiftOpsHref({ tab: "finance", finance: s.id })}
                className={[
                  "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
                  financeSub === s.id ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
                ].join(" ")}
                data-admin-gift-finance-sub={s.id}
              >
                {safeT(
                  (
                    {
                      external: "gift_ops_finance_external",
                      "store-cash": "gift_ops_finance_store_cash",
                      recovery: "gift_ops_finance_recovery",
                    } as const
                  )[s.id],
                  {
                    fallbackKo: s.ko,
                    fallbackEn: s.en,
                  }
                )}
              </Link>
            ))}
          </div>
          {financeSub === "recovery" ? (
            <AdminGiftRecoveryPanel id={id} />
          ) : (
            <AdminGiftMoneyPanel
              moneySubtab={financeSub === "store-cash" ? "store-cash" : "external"}
              id={id}
              status={status}
            />
          )}
        </div>
      ) : null}
      {tab === "audit" ? <AdminGiftAuditPanel q={q} event={event} /> : null}
    </div>
  );
}
