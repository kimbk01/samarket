"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  OWNER_ADMIN_FIELD_INPUT_CLASS,
  OWNER_ADMIN_FIELD_LABEL_CLASS,
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

const FIELD =
  "flex min-w-0 flex-col gap-1";
const CTA =
  "min-h-[44px] w-full rounded-ui-rect bg-signature px-4 text-sm font-medium text-white disabled:opacity-50 sm:w-auto";

export function AdminStoreCouponAdminCreatePanel({
  stores,
  onCreated,
}: {
  stores: StoreOpt[];
  onCreated: (title: string) => void;
}) {
  const { t, safeT } = useI18n();
  const now = useMemo(() => new Date(), []);
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
        const issuedTitle = title.trim();
        if (!storeId || !startAt || !endAt || !issuedTitle) {
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
          title: issuedTitle,
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
        onCreated(issuedTitle);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <AdminCard titleKey="store_coupon_admin_role_create">
      <div className="flex min-w-0 flex-col gap-3" data-admin-coupon-pane="create" data-admin-coupon-create="1">
        <p className="text-sm text-sam-muted">{t("store_coupon_admin_create_hint")}</p>
        {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
        <div className="max-h-[min(32rem,58vh)] min-w-0 overflow-y-auto">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_admin_pick_store")}</span>
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
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_title")}</span>
              <input
                className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                data-admin-coupon-create-title="1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_funding")}</span>
              <select
                className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                data-admin-coupon-create-funding="1"
                value={funding}
                onChange={(e) => setFunding(e.target.value as "PLATFORM_FUNDED" | "SHARED_FUNDED")}
              >
                <option value="PLATFORM_FUNDED">{t("store_coupon_funding_platform")}</option>
                <option value="SHARED_FUNDED">{t("store_coupon_funding_shared")}</option>
              </select>
            </label>
            {funding === "SHARED_FUNDED" ? (
              <label className={FIELD}>
                <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_store_share")}</span>
                <input
                  className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                  data-admin-coupon-create-share="1"
                  value={storeShare}
                  onChange={(e) => setStoreShare(e.target.value)}
                />
              </label>
            ) : null}
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_discount")}</span>
              <select
                className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                value={kind}
                onChange={(e) => setKind(e.target.value as "percent" | "fixed_amount")}
              >
                <option value="fixed_amount">{t("store_coupon_kind_fixed")}</option>
                <option value="percent">{t("store_coupon_kind_percent")}</option>
              </select>
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_discount_value")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_min_order")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_max_discount")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_limit")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={issueLimit} onChange={(e) => setIssueLimit(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_spend_budget")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={spendBudget} onChange={(e) => setSpendBudget(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_target_all")}</span>
              <select
                className={OWNER_ADMIN_FIELD_INPUT_CLASS}
                value={target}
                onChange={(e) => setTarget(e.target.value as "ALL" | "STORE" | "PLATFORM")}
              >
                <option value="ALL">{t("store_coupon_target_all")}</option>
                <option value="STORE">{t("store_coupon_target_store_first")}</option>
                <option value="PLATFORM">{t("store_coupon_target_platform_first")}</option>
              </select>
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_days")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={claimDays} onChange={(e) => setClaimDays(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_start")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} type="datetime-local" value={issueStart} onChange={(e) => setIssueStart(e.target.value)} />
            </label>
            <label className={FIELD}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_end")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} type="datetime-local" value={issueEnd} onChange={(e) => setIssueEnd(e.target.value)} />
            </label>
            <label className={`${FIELD} sm:col-span-2`}>
              <span className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_end")}</span>
              <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} type="datetime-local" value={usageEnd} onChange={(e) => setUsageEnd(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex min-h-[44px] items-center">
          <button
            type="button"
            className={CTA}
            disabled={busy || !storeId}
            data-admin-coupon-create-submit="1"
            onClick={() => void publish()}
          >
            {t("store_coupon_admin_create_submit")}
          </button>
        </div>
      </div>
    </AdminCard>
  );
}
