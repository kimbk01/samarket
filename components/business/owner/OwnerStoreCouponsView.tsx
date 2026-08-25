"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_FIELD_INPUT_CLASS,
  OWNER_ADMIN_FIELD_LABEL_CLASS,
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
  first_order_scope?: string | null;
  start_at?: string;
  end_at?: string;
  usage_end_at?: string | null;
  store_funded_amount?: number | null;
  max_discount?: number | null;
};

export function OwnerStoreCouponsView() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() ?? "";
  const [resolvedStoreId, setResolvedStoreId] = useState(storeId);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed_amount">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [issueLimit, setIssueLimit] = useState("");
  const [spendBudget, setSpendBudget] = useState("");
  const [claimDays, setClaimDays] = useState("7");
  const [target, setTarget] = useState<"ALL" | "STORE" | "PLATFORM">("ALL");
  const [funding, setFunding] = useState<"STORE_FUNDED" | "PLATFORM_FUNDED" | "SHARED_FUNDED">("STORE_FUNDED");
  const [storeShare, setStoreShare] = useState("60");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const act = (id: string, action: string) => {
    void fetch("/api/me/store-coupons/campaigns", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).then(() => load());
  };

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <OwnerStoreAdminDashSection title={t("store_coupon_owner_title")}>
        {rows.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_coupon_owner_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className={OWNER_ADMIN_LIST_CARD_CLASS}>
                <p className="font-medium">{row.title}</p>
                <p className="text-xs text-sam-muted">
                  {row.discount_type === "percent"
                    ? `${row.discount_value}%`
                    : `₱${row.discount_value}`}{" "}
                  {row.max_discount != null ? `(max ₱${row.max_discount})` : ""} ·{" "}
                  {t("store_coupon_min_order")} {row.min_order_amount ?? 0} · {row.lifecycle_state} ·{" "}
                  {row.funding_mode}
                  {row.store_funded_amount != null ? ` ₱${row.store_funded_amount}` : ""} ·{" "}
                  {row.issued_count ?? 0}
                  {row.issue_limit != null ? `/${row.issue_limit}` : ""}
                  {row.spend_budget_php != null
                    ? ` · ${row.reserved_spend_php ?? 0}/${row.spend_budget_php}`
                    : ""}
                </p>
                <p className="text-xs text-sam-muted">
                  {t("store_coupon_issue_window")} {String(row.start_at ?? "").slice(0, 10)}–{String(row.end_at ?? "").slice(0, 10)}
                  {row.usage_end_at ? ` · ${t("store_coupon_usage_window")} ${String(row.usage_end_at).slice(0, 10)}` : ""}
                  {row.first_order_scope ? ` · ${row.first_order_scope}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.lifecycle_state === "paused" ? (
                    <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(row.id, "resume")}>
                      {t("store_coupon_owner_resume")}
                    </button>
                  ) : (
                    <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(row.id, "pause")}>
                      {t("store_coupon_owner_pause")}
                    </button>
                  )}
                  <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(row.id, "end")}>
                    {t("store_coupon_owner_end")}
                  </button>
                  <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(row.id, "reissue")}>
                    {t("store_coupon_owner_reissue")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 space-y-2">
          {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_title")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_discount")}</label>
          <select
            className={OWNER_ADMIN_FIELD_INPUT_CLASS}
            value={kind}
            onChange={(e) => setKind(e.target.value as "percent" | "fixed_amount")}
          >
            <option value="percent">{t("store_coupon_kind_percent")}</option>
            <option value="fixed_amount">{t("store_coupon_kind_fixed")}</option>
          </select>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_min_order")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_max_discount")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_limit")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={issueLimit} onChange={(e) => setIssueLimit(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_spend_budget")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={spendBudget} onChange={(e) => setSpendBudget(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_days")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={claimDays} onChange={(e) => setClaimDays(e.target.value)} />
          <select
            className={OWNER_ADMIN_FIELD_INPUT_CLASS}
            value={target}
            onChange={(e) => setTarget(e.target.value as "ALL" | "STORE" | "PLATFORM")}
          >
            <option value="ALL">{t("store_coupon_target_all")}</option>
            <option value="STORE">{t("store_coupon_target_store_first")}</option>
            <option value="PLATFORM">{t("store_coupon_target_platform_first")}</option>
          </select>
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_funding")}</label>
          <select
            className={OWNER_ADMIN_FIELD_INPUT_CLASS}
            value={funding}
            onChange={(e) => setFunding(e.target.value as typeof funding)}
          >
            <option value="STORE_FUNDED">{t("store_coupon_funding_store")}</option>
            <option value="PLATFORM_FUNDED">{t("store_coupon_funding_platform")}</option>
            <option value="SHARED_FUNDED">{t("store_coupon_funding_shared")}</option>
          </select>
          {funding === "SHARED_FUNDED" ? (
            <>
              <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_store_share")}</label>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={storeShare} onChange={(e) => setStoreShare(e.target.value)} />
            </>
          ) : null}
          <button
            type="button"
            disabled={busy || !resolvedStoreId}
            className={OWNER_ADMIN_PRIMARY_BTN_CLASS}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setErr(null);
                try {
                  const start = new Date();
                  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
                  const res = await fetch("/api/me/store-coupons/campaigns", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      storeId: resolvedStoreId,
                      title: title.trim(),
                      discountType: kind,
                      discountValue: Number(discountValue),
                      minOrderAmount: minOrder.trim() ? Number(minOrder) : null,
                      maxDiscount: maxDiscount.trim() ? Number(maxDiscount) : null,
                      issueLimit: issueLimit.trim() ? Number(issueLimit) : null,
                      spendBudgetPhp: spendBudget.trim() ? Number(spendBudget) : null,
                      claimValidDays: claimDays.trim() ? Number(claimDays) : null,
                      firstOrderScope: target === "ALL" ? null : target,
                      termsCopy: null,
                      startAt: start.toISOString(),
                      endAt: end.toISOString(),
                      usageEndAt: new Date(start.getTime() + Number(claimDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
                      isActive: true,
                      fundingMode: funding,
                      storeFundedAmount: funding === "SHARED_FUNDED" && storeShare.trim() ? Number(storeShare) : null,
                    }),
                  });
                  const json = (await res.json()) as { ok?: boolean; error?: string };
                  if (!res.ok || !json.ok) {
                    setErr(json.error ?? "db_error");
                    return;
                  }
                  setTitle("");
                  await load();
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t("store_coupon_owner_create")}
          </button>
        </div>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
