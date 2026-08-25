"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OWNER_ADMIN_FIELD_INPUT_CLASS,
  OWNER_ADMIN_FIELD_LABEL_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { humanAdminStoreName } from "@/lib/stores/admin-coupon-control-view";

type StoreOpt = { id: string; name: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

export function AdminStoreCouponAdminCreatePanel({
  stores,
  onCreated,
}: {
  stores: StoreOpt[];
  onCreated: () => void;
}) {
  const { t, safeT } = useI18n();
  const now = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed_amount">("fixed_amount");
  const [discountValue, setDiscountValue] = useState("100");
  const [minOrder, setMinOrder] = useState("700");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [issueLimit, setIssueLimit] = useState("20");
  const [spendBudget, setSpendBudget] = useState("20000");
  const [claimDays, setClaimDays] = useState("7");
  const [target, setTarget] = useState<"ALL" | "STORE" | "PLATFORM">("ALL");
  const [funding, setFunding] = useState<"PLATFORM_FUNDED" | "SHARED_FUNDED">("PLATFORM_FUNDED");
  const [storeShare, setStoreShare] = useState("60");
  const [issueStart, setIssueStart] = useState(() => toLocalInput(now));
  const [issueEnd, setIssueEnd] = useState(() => toLocalInput(new Date(now.getTime() + 30 * 86400000)));
  const [usageEnd, setUsageEnd] = useState(() => toLocalInput(new Date(now.getTime() + 7 * 86400000)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!storeId && stores[0]?.id) setStoreId(stores[0].id);
  }, [storeId, stores]);

  const publish = () => {
    void (async () => {
      setBusy(true);
      setErr(null);
      try {
        const startAt = fromLocalInput(issueStart);
        const endAt = fromLocalInput(issueEnd);
        const usageEndAt = fromLocalInput(usageEnd);
        if (!storeId || !startAt || !endAt) {
          setErr(
            safeT("store_coupon_admin_act_fail", {
              fallbackKo: "처리할 수 없습니다.",
              fallbackEn: "Could not complete that action.",
            })
          );
          return;
        }
        const body: Record<string, unknown> = {
          storeId,
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
          startAt,
          endAt,
          usageEndAt: usageEndAt || null,
          isActive: true,
          fundingMode: funding,
        };
        if (funding === "SHARED_FUNDED") {
          body.storeFundedAmount = Number(storeShare);
        }
        const res = await fetch("/api/admin/store-coupons", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (json.error === "admin_funding_forbidden") setErr(t("store_coupon_admin_funding_fail"));
          else if (json.error === "admin_shared_share_required") setErr(t("store_coupon_admin_share_fail"));
          else {
            setErr(
              safeT("store_coupon_admin_act_fail", {
                fallbackKo: "처리할 수 없습니다.",
                fallbackEn: "Could not complete that action.",
              })
            );
          }
          return;
        }
        setTitle("");
        setOpen(false);
        onCreated();
      } finally {
        setBusy(false);
      }
    })();
  };

  if (!open) {
    return (
      <button
        type="button"
        className={`${OWNER_ADMIN_PRIMARY_BTN_CLASS} mb-3`}
        data-admin-coupon-create-open="1"
        onClick={() => {
          if (stores[0]?.id) setStoreId(stores[0].id);
          setOpen(true);
        }}
      >
        {t("store_coupon_admin_create")}
      </button>
    );
  }

  return (
    <div className="mb-4 min-w-0 space-y-2 rounded-ui-rect border border-sam-border p-3" data-admin-coupon-create="1">
      <p className="text-[13px] text-sam-muted">{t("store_coupon_admin_create_hint")}</p>
      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_admin_pick_store")}</label>
      <select
        className={OWNER_ADMIN_FIELD_INPUT_CLASS}
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {humanAdminStoreName(s.name) ?? t("store_coupon_wallet_store_fallback")}
          </option>
        ))}
      </select>
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_title")}</label>
      <input
        className={OWNER_ADMIN_FIELD_INPUT_CLASS}
        data-admin-coupon-create-title="1"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_funding")}</label>
      <select
        className={OWNER_ADMIN_FIELD_INPUT_CLASS}
        value={funding}
        onChange={(e) => setFunding(e.target.value as "PLATFORM_FUNDED" | "SHARED_FUNDED")}
      >
        <option value="PLATFORM_FUNDED">{t("store_coupon_funding_platform")}</option>
        <option value="SHARED_FUNDED">{t("store_coupon_funding_shared")}</option>
      </select>
      {funding === "SHARED_FUNDED" ? (
        <>
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_store_share")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={storeShare} onChange={(e) => setStoreShare(e.target.value)} />
        </>
      ) : null}
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_discount")}</label>
      <select
        className={OWNER_ADMIN_FIELD_INPUT_CLASS}
        value={kind}
        onChange={(e) => setKind(e.target.value as "percent" | "fixed_amount")}
      >
        <option value="fixed_amount">{t("store_coupon_kind_fixed")}</option>
        <option value="percent">{t("store_coupon_kind_percent")}</option>
      </select>
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_discount_value")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_min_order")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_max_discount")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_limit")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={issueLimit} onChange={(e) => setIssueLimit(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_spend_budget")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={spendBudget} onChange={(e) => setSpendBudget(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_target_all")}</label>
      <select
        className={OWNER_ADMIN_FIELD_INPUT_CLASS}
        value={target}
        onChange={(e) => setTarget(e.target.value as "ALL" | "STORE" | "PLATFORM")}
      >
        <option value="ALL">{t("store_coupon_target_all")}</option>
        <option value="STORE">{t("store_coupon_target_store_first")}</option>
        <option value="PLATFORM">{t("store_coupon_target_platform_first")}</option>
      </select>
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_start")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} type="datetime-local" value={issueStart} onChange={(e) => setIssueStart(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_end")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} type="datetime-local" value={issueEnd} onChange={(e) => setIssueEnd(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_end")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} type="datetime-local" value={usageEnd} onChange={(e) => setUsageEnd(e.target.value)} />
      <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_days")}</label>
      <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={claimDays} onChange={(e) => setClaimDays(e.target.value)} />
      <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} disabled={busy} onClick={() => void publish()}>
        {t("store_coupon_admin_create_submit")}
      </button>
    </div>
  );
}
