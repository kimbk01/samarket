"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OWNER_ADMIN_FIELD_INPUT_CLASS,
  OWNER_ADMIN_FIELD_LABEL_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OWNER_STORE_PROFILE_INNER_PANEL_CLASS } from "@/lib/business/owner-store-stack";
import { formatMoneyPhp } from "@/lib/utils/format";

type StepId = "benefit" | "condition" | "issue" | "use" | "cost" | "preview";
const STEPS: StepId[] = ["benefit", "condition", "issue", "use", "cost", "preview"];

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

export function OwnerStoreCouponCreatePanel({
  storeId,
  onCreated,
}: {
  storeId: string;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed_amount">("fixed_amount");
  const [discountValue, setDiscountValue] = useState("100");
  const [minOrder, setMinOrder] = useState("700");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [issueLimit, setIssueLimit] = useState("20");
  const [spendBudget, setSpendBudget] = useState("20000");
  const [claimDays, setClaimDays] = useState("7");
  const [target, setTarget] = useState<"ALL" | "STORE" | "PLATFORM">("ALL");
  const [issueStart, setIssueStart] = useState(() => toLocalInput(now));
  const [issueEnd, setIssueEnd] = useState(() => toLocalInput(new Date(now.getTime() + 30 * 86400000)));
  const [usageEnd, setUsageEnd] = useState(() => toLocalInput(new Date(now.getTime() + 7 * 86400000)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stepId = STEPS[step];
  const stepLabel: Record<StepId, string> = {
    benefit: t("store_coupon_owner_create_step_benefit"),
    condition: t("store_coupon_owner_create_step_condition"),
    issue: t("store_coupon_owner_create_step_issue"),
    use: t("store_coupon_owner_create_step_use"),
    cost: t("store_coupon_owner_create_step_cost"),
    preview: t("store_coupon_owner_create_step_preview"),
  };

  const guideAmount = useMemo(() => {
    if (kind !== "fixed_amount") return null;
    const n = Number(issueLimit);
    const d = Number(discountValue);
    if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) return null;
    return n * d;
  }, [kind, issueLimit, discountValue]);

  const publish = () => {
    void (async () => {
      setBusy(true);
      setErr(null);
      try {
        const startAt = fromLocalInput(issueStart);
        const endAt = fromLocalInput(issueEnd);
        const usageEndAt = fromLocalInput(usageEnd);
        if (!startAt || !endAt) {
          setErr("invalid_window");
          return;
        }
        const res = await fetch("/api/me/store-coupons/campaigns", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setErr(json.error ?? "db_error");
          return;
        }
        onCreated();
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="min-w-0 space-y-3" data-store-coupon-create-flow="1">
      <div className="grid min-w-0 grid-cols-6 gap-1" data-store-coupon-create-steps="1">
        {STEPS.map((id, i) => (
          <button
            key={id}
            type="button"
            className={`min-w-0 truncate rounded-ui-rect px-0.5 py-1 text-center text-[10px] leading-tight ${
              i === step ? "bg-signature text-white" : "bg-sam-app text-sam-muted"
            }`}
            onClick={() => setStep(i)}
          >
            {stepLabel[id]}
          </button>
        ))}
      </div>
      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}

      {stepId === "benefit" ? (
        <div className={OWNER_STORE_PROFILE_INNER_PANEL_CLASS} data-store-coupon-create-step="benefit">
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_field_title")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
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
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_max_discount")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
        </div>
      ) : null}

      {stepId === "condition" ? (
        <div className={OWNER_STORE_PROFILE_INNER_PANEL_CLASS} data-store-coupon-create-step="condition">
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_min_order")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
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
        </div>
      ) : null}

      {stepId === "issue" ? (
        <div className={OWNER_STORE_PROFILE_INNER_PANEL_CLASS} data-store-coupon-create-step="issue">
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_start")}</label>
          <input type="datetime-local" className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={issueStart} onChange={(e) => setIssueStart(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_end")}</label>
          <input type="datetime-local" className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={issueEnd} onChange={(e) => setIssueEnd(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_issue_limit")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={issueLimit} onChange={(e) => setIssueLimit(e.target.value)} />
        </div>
      ) : null}

      {stepId === "use" ? (
        <div className={OWNER_STORE_PROFILE_INNER_PANEL_CLASS} data-store-coupon-create-step="use">
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_days")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={claimDays} onChange={(e) => setClaimDays(e.target.value)} />
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_usage_end")}</label>
          <input type="datetime-local" className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={usageEnd} onChange={(e) => setUsageEnd(e.target.value)} />
        </div>
      ) : null}

      {stepId === "cost" ? (
        <div className={OWNER_STORE_PROFILE_INNER_PANEL_CLASS} data-store-coupon-create-step="cost">
          <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg">
            {t("store_coupon_owner_create_lock")}
          </p>
          <p className="text-sm font-medium text-sam-fg">
            {t("store_coupon_funding")}: {t("store_coupon_funding_store")}
          </p>
          <label className={OWNER_ADMIN_FIELD_LABEL_CLASS}>{t("store_coupon_spend_budget")}</label>
          <input className={OWNER_ADMIN_FIELD_INPUT_CLASS} value={spendBudget} onChange={(e) => setSpendBudget(e.target.value)} />
          {guideAmount != null ? (
            <p className="text-xs text-sam-muted">
              {t("store_coupon_owner_burden_guide", { amount: formatMoneyPhp(guideAmount) })}
            </p>
          ) : null}
        </div>
      ) : null}

      {stepId === "preview" ? (
        <div className={OWNER_STORE_PROFILE_INNER_PANEL_CLASS} data-store-coupon-create-step="preview">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-lg font-bold text-sam-fg">
              {kind === "percent" ? `${discountValue}%` : formatMoneyPhp(Number(discountValue) || 0)}
            </p>
            <p className="mt-1 text-sm text-sam-fg">{title.trim() || t("store_coupon_field_title")}</p>
            <p className="mt-2 text-xs text-sam-muted">
              {t("store_coupon_min_order")} {minOrder.trim() ? formatMoneyPhp(Number(minOrder) || 0) : "—"}
            </p>
            <p className="text-xs text-sam-muted">
              {t("store_coupon_issue_window")} {issueStart.slice(0, 10).replaceAll("-", ".")} – {issueEnd.slice(0, 10).replaceAll("-", ".")}
            </p>
            <p className="text-xs text-sam-muted">
              {t("store_coupon_issue_limit")} {issueLimit || "—"} · {t("store_coupon_spend_budget")}{" "}
              {spendBudget.trim() ? formatMoneyPhp(Number(spendBudget) || 0) : "—"}
            </p>
            <p className="text-xs text-sam-muted">
              {target === "STORE"
                ? t("store_coupon_target_store_first")
                : target === "PLATFORM"
                  ? t("store_coupon_target_platform_first")
                  : t("store_coupon_target_all")}
            </p>
            <p className="mt-2 text-xs text-sam-fg">
              {t("store_coupon_funding")}: {t("store_coupon_funding_store")}
            </p>
          </div>
          <p className="text-xs text-sam-muted">{t("store_coupon_owner_create_no_edit")}</p>
        </div>
      ) : null}

      <div className="flex min-w-0 gap-2">
        {step > 0 ? (
          <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} min-h-[44px] flex-1`} onClick={() => setStep((s) => s - 1)}>
            {t("store_coupon_owner_create_back")}
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className={`${OWNER_ADMIN_PRIMARY_BTN_CLASS} min-h-[44px] flex-1`}
            onClick={() => setStep((s) => s + 1)}
          >
            {t("store_coupon_owner_create_next")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !storeId}
            className={`${OWNER_ADMIN_PRIMARY_BTN_CLASS} min-h-[44px] flex-1`}
            onClick={publish}
          >
            {t("store_coupon_owner_create_publish")}
          </button>
        )}
      </div>
    </div>
  );
}
