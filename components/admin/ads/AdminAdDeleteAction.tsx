"use client";

/**
 * 광고 삭제 공용 버튼 (설계 `ads-admin-ssot-design-2026-11-07.md` §3-1 · §3-2 · §4 · R2 · 2026-11-07).
 * 사유 입력 → (서버 미리보기로 방식 확인 · 결제 있는 진행 중 광고면 귀책 선택 + 환급 미리보기) → 삭제.
 * **대상 재입력 없음** (Owner 「사유만 입력하면 바로 삭제」). 권한이 없으면 버튼이 꺼지고 이유를 보인다.
 * 서버: `POST /api/admin/ads/delete` → DB `admin_ad_delete` (한 트랜잭션 · 감사 1행).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { describeAdminRequirementDenial } from "@/lib/admin/access/admin-access-ui";
import { actorMeetsAdminRouteRequirement } from "@/lib/admin/access/admin-route-access";
import { adminAdKindWriteRequirement, type AdminAdDeleteKind } from "@/lib/admin/access/admin-ads-authority";
import { ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/operator-ux/admin-reason";
import {
  adminAdDeleteErrorMessageKey,
  type AdminAdDeleteFault,
  type AdminAdDeletePlan,
  type AdminAdRefundUnit,
} from "@/lib/admin/ads-delete/admin-ad-delete-contract";
import { formatAdminNumber, formatAdminPhpMinor } from "@/lib/admin/ui-standard/admin-format";

export type AdminAdDeleteResult = { kind: AdminAdDeleteKind; id: string; plan: AdminAdDeletePlan };

type Step = "reason" | "confirm";

function refundText(
  t: (k: "admin_ad_delete_unit_point", v?: Record<string, string | number>) => string,
  amount: number,
  unit: AdminAdRefundUnit
): string {
  if (unit === "point") return t("admin_ad_delete_unit_point", { amount: formatAdminNumber(amount) });
  if (unit === "business_cash") return formatAdminPhpMinor(amount);
  return formatAdminNumber(amount);
}

export function AdminAdDeleteAction({
  kind,
  id,
  title,
  onDone,
  size = "sm",
  ownerPopup = false,
  label,
}: {
  kind: AdminAdDeleteKind;
  id: string;
  /** 확인창 제목에 넣는 광고 이름 (재입력하지 않는다). */
  title: string;
  onDone?: (result: AdminAdDeleteResult) => void;
  size?: "sm" | "md";
  /** 사장님 팝업이면 business 키 (권한 표 §4). 모르면 false — 서버가 행을 읽어 다시 판단한다. */
  ownerPopup?: boolean;
  /** 버튼 문구 (기본 「삭제」). */
  label?: string;
}) {
  const { t, language } = useI18n();
  const { actor } = useAdminAccessActor();
  const requirement = useMemo(() => adminAdKindWriteRequirement(kind, { ownerPopup }), [kind, ownerPopup]);
  const deniedReason =
    actor && !actorMeetsAdminRouteRequirement(requirement, actor)
      ? describeAdminRequirementDenial(requirement, language)
      : null;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState("");
  const [fault, setFault] = useState<AdminAdDeleteFault | null>(null);
  const [plan, setPlan] = useState<AdminAdDeletePlan | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("reason");
      setReason("");
      setFault(null);
      setPlan(null);
      setPending(false);
      setError(null);
    }
  }, [open]);

  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= ADMIN_REASON_MIN_LENGTH;

  const call = useCallback(
    async (opts: { preview: boolean; fault: AdminAdDeleteFault | null }) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/ads/delete", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            id,
            reason: trimmed,
            ...(opts.fault ? { fault: opts.fault } : {}),
            ...(opts.preview ? { preview: true } : {}),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          plan?: AdminAdDeletePlan;
        };
        if (!res.ok || json.ok !== true || !json.plan) {
          setError(t(adminAdDeleteErrorMessageKey(json.error ?? null)));
          return null;
        }
        return json.plan;
      } catch {
        setError(t(adminAdDeleteErrorMessageKey("network_error")));
        return null;
      } finally {
        setPending(false);
      }
    },
    [id, kind, t, trimmed]
  );

  const goNext = async () => {
    if (!reasonOk || pending) return;
    const p = await call({ preview: true, fault: null });
    if (!p) return;
    setPlan(p);
    setFault(null);
    setStep("confirm");
  };

  const pickFault = async (f: AdminAdDeleteFault) => {
    setFault(f);
    const p = await call({ preview: true, fault: f });
    if (p) setPlan(p);
  };

  const submit = async () => {
    if (!plan || pending) return;
    if (plan.needsFault && !fault) return;
    const p = await call({ preview: false, fault: plan.needsFault ? fault : null });
    if (!p) return;
    setOpen(false);
    onDone?.({ kind, id, plan: p });
  };

  const modeText =
    plan?.mode === "hard"
      ? t("admin_ad_delete_mode_hard")
      : plan?.mode === "end_and_soft"
        ? t("admin_ad_delete_mode_end")
        : t("admin_ad_delete_mode_soft");
  const confirmDisabled = pending || !plan || (plan.needsFault && !fault);

  return (
    <>
      <span className="inline-flex flex-col items-start gap-0.5" data-admin-ad-delete={kind}>
        <AdminActionButton
          variant="danger"
          size={size}
          disabled={Boolean(deniedReason)}
          title={deniedReason ?? undefined}
          aria-label={label ?? t("admin_ad_delete_button")}
          onClick={() => setOpen(true)}
          data-admin-ad-delete-open="1"
        >
          {label ?? t("admin_ad_delete_button")}
        </AdminActionButton>
        {deniedReason ? (
          <span className="text-[12px] text-sam-muted" data-admin-ad-delete-denied="1">
            {deniedReason}
          </span>
        ) : null}
      </span>
      <DibayDialog
        open={open}
        onClose={pending ? undefined : () => setOpen(false)}
        dismissible={!pending}
        title={t("admin_ad_delete_title", { title })}
        description={step === "reason" ? t("admin_ad_delete_reason_hint", { min: ADMIN_REASON_MIN_LENGTH }) : modeText}
        ariaLabel={t("admin_ad_delete_title", { title })}
      >
        {step === "reason" ? (
          <label className={`mt-3 block ${OverlayUi.caption}`}>
            {t("admin_ad_delete_reason_label")}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={pending}
              placeholder={t("admin_ad_delete_reason_placeholder")}
              className="mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2 text-sm text-[color:var(--overlay-fg)]"
              data-admin-ad-delete-reason="1"
            />
          </label>
        ) : (
          <div className="mt-3 space-y-2" data-admin-ad-delete-plan={plan?.mode ?? ""}>
            {plan?.needsFault ? (
              <fieldset className="space-y-1" data-admin-ad-delete-fault="1">
                <legend className={OverlayUi.caption}>{t("admin_ad_delete_fault_label")}</legend>
                {(["operator", "advertiser"] as const).map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm text-[color:var(--overlay-fg)]">
                    <input
                      type="radio"
                      name={`admin-ad-delete-fault-${id}`}
                      checked={fault === f}
                      disabled={pending}
                      onChange={() => void pickFault(f)}
                      data-admin-ad-delete-fault-option={f}
                    />
                    {f === "operator" ? t("admin_ad_delete_fault_operator") : t("admin_ad_delete_fault_advertiser")}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {plan && plan.mode === "end_and_soft" && plan.refundUnit !== "none" ? (
              <p className="text-sm font-semibold text-[color:var(--overlay-fg)]" data-admin-ad-delete-refund="1">
                {plan.needsFault && !fault
                  ? t("admin_ad_delete_fault_pick")
                  : plan.refundAmount > 0
                    ? t("admin_ad_delete_refund_preview", { amount: refundText(t, plan.refundAmount, plan.refundUnit) })
                    : t("admin_ad_delete_refund_none")}
              </p>
            ) : null}
            <p className={OverlayUi.caption}>
              {t("admin_ad_delete_reason_label")}: {trimmed}
            </p>
          </div>
        )}
        {error ? (
          <p className="mt-2 text-sm text-sam-danger" role="alert" data-admin-ad-delete-error="1">
            {error}
          </p>
        ) : null}
        <div className={`${OverlayUi.actionsRow} mt-4`}>
          {step === "reason" ? (
            <>
              <DibayOverlayButton roleTone="secondary" onClick={() => setOpen(false)} disabled={pending}>
                {t("admin_ad_delete_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                disabled={pending || !reasonOk}
                loading={pending}
                onClick={() => void goNext()}
                data-admin-ad-delete-next="1"
              >
                {pending ? t("admin_ad_delete_checking") : t("admin_ad_delete_next")}
              </DibayOverlayButton>
            </>
          ) : (
            <>
              <DibayOverlayButton roleTone="secondary" onClick={() => setStep("reason")} disabled={pending}>
                {t("admin_ad_delete_back")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="destructive"
                disabled={confirmDisabled}
                loading={pending}
                onClick={() => void submit()}
                data-admin-ad-delete-submit="1"
              >
                {plan?.mode === "end_and_soft" ? t("admin_ad_delete_confirm_end") : t("admin_ad_delete_confirm")}
              </DibayOverlayButton>
            </>
          )}
        </div>
      </DibayDialog>
    </>
  );
}
