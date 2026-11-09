"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { ReviewBlock, ReviewRow } from "@/components/admin/stores/admin-store-review-ui";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDate, formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { splitLegalBodyParagraphs } from "@/lib/legal/app-legal-documents";
import {
  formatPartnerFeePercent,
  resolveLaunchFreeUntilForApproval,
  shouldCreateLaunchFreePolicy,
  type StorePartnerAgreementRow,
  type StorePartnerTermsDocument,
} from "@/lib/stores/partner/store-partner-agreement-contract";

type PartnerDetail = {
  termsPublished: boolean;
  currentVersion: string | null;
  agreedCurrentVersion: boolean;
  agreements: StorePartnerAgreementRow[];
  documents: Record<string, StorePartnerTermsDocument>;
  override: { freeUntil: string; reason: string; updatedAt: string } | null;
  launchPolicy: { id: string; endsAt: string | null; isActive: boolean } | null;
};

/** 승인 확인창 안내에 쓰는 요약 (패널이 받는다) */
export type AdminStorePartnerSummary = {
  /** 게시된 약관이 있는데 동의 기록이 없음 → 승인 409 */
  approvalBlocked: boolean;
  /** 승인하면 만들어질 0% 정책 종료일 (없으면 null) */
  launchFreeUntil: string | null;
};

/** 정책 종료 시각(다음날 00:00 PHT) → 마지막 무료 날짜 (PHT) */
function manilaDateBeforeEnd(iso: string | null): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  return formatAdminManilaDate(new Date(ms - 1));
}

/**
 * 입점 심사 패널 「입점 계약」 칸 (설계 v2 §4-5) — 최신 동의(버전·시각·경로·서명 당시 무료 종료·업종·요율)·원문 보기·
 * 「이 매장 무료 종료일」 수정(사유 필수 → PATCH action `set_launch_free_until`).
 */
export function AdminStorePartnerAgreementBlock({
  storeId,
  approvalStatus,
  storeTopicId,
  topicLabel,
  categoryLabel,
  onRunAction,
  busy,
  onSummary,
}: {
  storeId: string;
  approvalStatus: string;
  storeTopicId: string | null;
  topicLabel: string;
  categoryLabel: string;
  /** 입점 심사 패널과 같은 형태 (AdminStoreReviewPanelProps.onRunAction) */
  onRunAction?: (
    action: string,
    payload?: { reason?: string; enabled?: boolean; store_name?: string } & Record<string, unknown>
  ) => void | boolean | Promise<void | boolean>;
  busy: boolean;
  onSummary?: (summary: AdminStorePartnerSummary | null) => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [freeUntilInput, setFreeUntilInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}/partner-agreement`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as (PartnerDetail & { ok?: boolean }) | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setFailed(true);
          setDetail(null);
          return;
        }
        setDetail(json);
        setFreeUntilInput(json.override?.freeUntil ?? json.agreements[0]?.freeUntil ?? "");
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, reloadKey]);

  useEffect(() => {
    if (!onSummary) return;
    if (!detail) {
      onSummary(null);
      return;
    }
    const fu = resolveLaunchFreeUntilForApproval({
      overrideFreeUntil: detail.override?.freeUntil,
      latestAgreementFreeUntil: detail.agreements[0]?.freeUntil,
    });
    onSummary({
      approvalBlocked: detail.termsPublished && detail.agreements.length === 0,
      launchFreeUntil: fu && shouldCreateLaunchFreePolicy(fu) ? fu : null,
    });
  }, [detail, onSummary]);

  const approved = approvalStatus === "approved" || approvalStatus === "suspended";

  const saveFreeUntil = useCallback(async () => {
    if (!onRunAction || !freeUntilInput) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("approve"),
      ko,
      title: t("admin_partner_free_until_confirm_title"),
      description: approved
        ? t("admin_partner_free_until_confirm_desc_approved", { date: freeUntilInput })
        : t("admin_partner_free_until_confirm_desc_pending", { date: freeUntilInput }),
      confirmLabel: t("admin_partner_free_until_save_btn"),
      reasonPlaceholder: t("admin_partner_free_until_reason_ph"),
    });
    if (!confirmed.ok) return;
    setSaving(true);
    try {
      await onRunAction("set_launch_free_until", {
        free_until: freeUntilInput,
        ...(confirmed.reason ? { reason: confirmed.reason } : {}),
      });
    } finally {
      setSaving(false);
      setReloadKey((n) => n + 1);
    }
  }, [approved, freeUntilInput, ko, onRunAction, t]);

  if (failed) {
    return (
      <ReviewBlock title={t("admin_partner_block_title")}>
        <p className="py-2 text-[13px] text-sam-danger">{t("admin_partner_load_failed")}</p>
      </ReviewBlock>
    );
  }
  if (!detail) return null;

  const latest = detail.agreements[0] ?? null;
  const latestDoc = latest ? detail.documents[latest.legalDocumentId] ?? null : null;
  const pct = formatPartnerFeePercent(latest?.feePercentAfter ?? null);
  const signedCategory = latest
    ? latest.storeTopicId && latest.storeTopicId === storeTopicId
      ? [categoryLabel, topicLabel].filter(Boolean).join(" · ") || "—"
      : t("admin_partner_category_changed")
    : "—";

  return (
    <ReviewBlock title={t("admin_partner_block_title")}>
      <div className="py-1" data-admin-store-partner-agreement="1">
        {!detail.termsPublished ? (
          <p className="py-1 text-[12px] text-sam-muted">{t("admin_partner_no_published")}</p>
        ) : null}
        {latest ? (
          <>
            <ReviewRow
              label={t("admin_partner_latest")}
              value={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span>
                    {latest.documentVersion} · {formatAdminManilaDateTime(latest.agreedAt)} ·{" "}
                    {latest.source === "reconsent"
                      ? t("admin_partner_source_reconsent")
                      : t("admin_partner_source_application")}
                  </span>
                  {!detail.agreedCurrentVersion ? (
                    <AdminToneBadge tone="warning">{t("admin_partner_needs_reconsent_badge")}</AdminToneBadge>
                  ) : null}
                </span>
              }
            />
            <ReviewRow label={t("admin_partner_row_signed_free")} value={latest.freeUntil ?? t("admin_partner_none")} />
            <ReviewRow label={t("admin_partner_row_category")} value={signedCategory} />
            <ReviewRow label={t("admin_partner_row_fee")} value={pct ? `${pct}%` : "—"} />
            {latestDoc ? (
              <div className="py-1">
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  aria-expanded={showText}
                  onClick={() => setShowText((v) => !v)}
                >
                  {t("admin_partner_view_text_btn")}
                </AdminActionButton>
                {showText ? (
                  <div
                    className="mt-2 max-h-80 space-y-2 overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface-muted p-3 text-[13px] leading-relaxed text-sam-fg"
                    data-admin-partner-terms-text="1"
                  >
                    <p className="font-semibold">
                      {latestDoc.title} · {latestDoc.version} · {latestDoc.locale}
                    </p>
                    {splitLegalBodyParagraphs(latestDoc.body).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <ReviewRow
            label={t("admin_partner_latest")}
            value={
              <AdminToneBadge tone={detail.termsPublished ? "warning" : "neutral"}>
                {t("admin_partner_no_agreement")}
              </AdminToneBadge>
            }
          />
        )}
        {detail.termsPublished && !latest && !approved ? (
          <p className="py-1 text-[12px] text-sam-warning">{t("admin_partner_approve_needs_agreement")}</p>
        ) : null}
        <ReviewRow
          label={t("admin_partner_policy_current")}
          value={
            detail.launchPolicy
              ? t("admin_partner_policy_until", { date: manilaDateBeforeEnd(detail.launchPolicy.endsAt) })
              : t("admin_partner_none")
          }
        />
        {onRunAction ? (
          <ReviewRow
            label={t("admin_partner_free_until_label")}
            value={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={freeUntilInput}
                  min={formatAdminManilaDate(new Date())}
                  onChange={(e) => setFreeUntilInput(e.target.value)}
                  disabled={busy || saving}
                  className="rounded-sm border border-sam-border bg-white px-2.5 py-1.5 text-sam-fg outline-none focus:border-sam-primary"
                />
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  disabled={busy || saving || !freeUntilInput}
                  onClick={() => void saveFreeUntil()}
                >
                  {t("admin_partner_free_until_save_btn")}
                </AdminActionButton>
                {detail.override ? (
                  <span className="text-[12px] text-sam-muted">
                    {t("admin_partner_override_badge", { date: detail.override.freeUntil })}
                  </span>
                ) : null}
              </div>
            }
          />
        ) : null}
      </div>
    </ReviewBlock>
  );
}
