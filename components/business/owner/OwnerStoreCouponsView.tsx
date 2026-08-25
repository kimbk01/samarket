"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreCouponCreatePanel } from "@/components/business/owner/OwnerStoreCouponCreatePanel";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerMobileStackedLabelCount } from "@/components/business/owner/OwnerMobileStackedLabelCount";
import { buildOwnerMobileStackedLabelCountAriaLabel } from "@/lib/business/owner-mobile-stacked-label-count";
import { formatMoneyPhp } from "@/lib/utils/format";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  ownerCouponListStatus,
  ownerCouponListStatusMessageKey,
  ownerCouponListTab,
  type OwnerCouponListTab,
} from "@/lib/stores/owner-coupon-list-bucket";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";

type CampaignRow = {
  id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  lifecycle_state: string;
  funding_mode: string;
  issued_count?: number;
  issue_limit?: number | null;
  spend_budget_php?: number | null;
  reserved_spend_php?: number | null;
  redeemed_count?: number;
  start_at?: string;
  end_at?: string;
  usage_end_at?: string | null;
  max_discount?: number | null;
};

function dayLabel(iso?: string | null): string {
  const s = String(iso ?? "").slice(0, 10);
  return s ? s.replaceAll("-", ".") : "—";
}

function benefitLabel(row: CampaignRow): string {
  if (row.discount_type === "percent") return `${row.discount_value}%`;
  return formatMoneyPhp(row.discount_value);
}

const TABS: Array<{ id: OwnerCouponListTab; labelKey: "store_coupon_owner_tab_active" | "store_coupon_owner_tab_upcoming" | "store_coupon_owner_tab_ended" }> = [
  { id: "active", labelKey: "store_coupon_owner_tab_active" },
  { id: "upcoming", labelKey: "store_coupon_owner_tab_upcoming" },
  { id: "ended", labelKey: "store_coupon_owner_tab_ended" },
];

export function OwnerStoreCouponsView() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() ?? "";
  const createMode = sp.get("create") === "1";
  const [resolvedStoreId, setResolvedStoreId] = useState(storeId);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [tab, setTab] = useState<OwnerCouponListTab>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [endId, setEndId] = useState<string | null>(null);

  useEffect(() => {
    if (storeId) {
      setResolvedStoreId(storeId);
      return;
    }
    void (async () => {
      const { json } = await fetchMeStoresListDeduped();
      const j = json as { ok?: boolean; stores?: { id: string }[] };
      const id = j?.ok && j.stores?.[0]?.id ? String(j.stores[0].id) : "";
      setResolvedStoreId(id);
    })();
  }, [storeId]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    const res = await fetch(`/api/me/store-coupons/campaigns?storeId=${encodeURIComponent(sid)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; campaigns?: CampaignRow[] };
    setRows(json.ok ? json.campaigns ?? [] : []);
  }, [resolvedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nowMs = Date.now();
  const counts = useMemo(() => {
    const c = { active: 0, upcoming: 0, ended: 0 };
    for (const row of rows) c[ownerCouponListTab(row, nowMs)] += 1;
    return c;
  }, [rows, nowMs]);

  const visible = useMemo(
    () => rows.filter((row) => ownerCouponListTab(row, nowMs) === tab),
    [rows, nowMs, tab]
  );

  const act = (id: string, action: string) => {
    void fetch("/api/me/store-coupons/campaigns", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).then(() => load());
  };

  const goList = () => router.push(OwnerRoutes.coupons(resolvedStoreId));
  const goCreate = () => router.push(OwnerRoutes.couponsCreate(resolvedStoreId));

  if (createMode) {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <OwnerStoreAdminDashSection title={t("store_coupon_owner_create")}>
          <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mb-3`} onClick={goList}>
            {t("store_coupon_owner_back_list")}
          </button>
          <OwnerStoreCouponCreatePanel
            storeId={resolvedStoreId}
            onCreated={() => {
              void load();
              goList();
            }}
          />
        </OwnerStoreAdminDashSection>
      </div>
    );
  }

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <OwnerStoreAdminDashSection title={t("store_coupon_owner_title")}>
        <div className="mb-3 grid grid-cols-3 gap-1">
          {TABS.map((def) => {
            const count = counts[def.id];
            const selected = tab === def.id;
            return (
              <button
                key={def.id}
                type="button"
                className={`min-w-0 rounded-ui-rect px-1 py-2 ${selected ? "bg-signature/15" : "bg-sam-app"}`}
                aria-label={buildOwnerMobileStackedLabelCountAriaLabel(t(def.labelKey), count)}
                onClick={() => setTab(def.id)}
              >
                <OwnerMobileStackedLabelCount label={t(def.labelKey)} count={count} variant="tab" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!resolvedStoreId}
          className={`${OWNER_ADMIN_PRIMARY_BTN_CLASS} mb-3 w-full`}
          onClick={goCreate}
        >
          {t("store_coupon_owner_create")}
        </button>
        {visible.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_coupon_owner_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) => {
              const status = ownerCouponListStatus(row, nowMs);
              const issued = Number(row.issued_count ?? 0);
              const used = Number(row.redeemed_count ?? 0);
              const rate = issued > 0 ? `${Math.round((used / issued) * 100)}%` : "—";
              const open = openId === row.id;
              return (
                <li key={row.id} className={OWNER_ADMIN_LIST_CARD_CLASS}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sam-fg">{benefitLabel(row)}</p>
                    <span className="shrink-0 text-xs text-sam-muted">{t(ownerCouponListStatusMessageKey(status))}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-sam-fg">{row.title}</p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {dayLabel(row.start_at)} – {dayLabel(row.end_at)}
                    {row.usage_end_at ? ` · ${t("store_coupon_usage_window")} ${dayLabel(row.usage_end_at)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {t("store_coupon_owner_issued", { count: issued })}
                    {row.issue_limit != null ? `/${row.issue_limit}` : ""}
                    {" · "}
                    {t("store_coupon_owner_used", { count: used })}
                    {" · "}
                    {t("store_coupon_owner_usage_rate", { rate })}
                  </p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {t("store_coupon_admin_budget_label")}{" "}
                    {row.spend_budget_php != null ? formatMoneyPhp(row.spend_budget_php) : "—"}
                    {" · "}
                    {t("store_coupon_admin_reserved_label")} {formatMoneyPhp(Number(row.reserved_spend_php ?? 0) || 0)}
                  </p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {t("store_coupon_funding")}:{" "}
                    {row.funding_mode === "PLATFORM_FUNDED"
                      ? t("store_coupon_funding_platform")
                      : row.funding_mode === "SHARED_FUNDED"
                        ? t("store_coupon_funding_shared")
                        : t("store_coupon_funding_store")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                      onClick={() => setOpenId(open ? null : row.id)}
                    >
                      {open ? t("store_coupon_admin_close") : t("store_coupon_admin_open")}
                    </button>
                    {status === "paused" ? (
                      <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(row.id, "resume")}>
                        {t("store_coupon_owner_resume")}
                      </button>
                    ) : status === "ended" || status === "requested" ? null : (
                      <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(row.id, "pause")}>
                        {t("store_coupon_owner_pause")}
                      </button>
                    )}
                    {status !== "ended" ? (
                      <button
                        type="button"
                        className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-sam-danger`}
                        onClick={() => setEndId(row.id)}
                      >
                        {t("store_coupon_owner_end")}
                      </button>
                    ) : null}
                  </div>
                  {open ? (
                    <div className="mt-2 border-t border-sam-border-soft pt-2">
                      <p className="text-xs text-sam-muted">
                        {t("store_coupon_min_order")}{" "}
                        {row.min_order_amount != null ? formatMoneyPhp(row.min_order_amount) : "—"}
                        {row.max_discount != null ? ` · ${t("store_coupon_max_discount")} ${formatMoneyPhp(row.max_discount)}` : ""}
                      </p>
                      <button
                        type="button"
                        className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2`}
                        onClick={() => act(row.id, "reissue")}
                      >
                        {t("store_coupon_owner_reissue")}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </OwnerStoreAdminDashSection>
      <OwnerStoreAdminConfirmModal
        open={Boolean(endId)}
        titleId="owner-coupon-end"
        title={t("store_coupon_owner_end")}
        description={t("store_coupon_owner_end_confirm")}
        confirmTone="danger"
        confirmLabel={t("store_coupon_owner_end")}
        onCancel={() => setEndId(null)}
        onConfirm={async () => {
          if (!endId) return;
          act(endId, "end");
          setEndId(null);
        }}
      />
    </div>
  );
}
