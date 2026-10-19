"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction, type AdminConfirmLevel } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import {
  allowedStoreApprovalActions,
  type AdminStoreApprovalAction,
} from "@/lib/admin-business/admin-store-decision-rules";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  type AdminStoreReviewRow,
  buildAdminStoreDateRows,
  type TaxonomyRelation,
} from "@/components/admin/stores/admin-store-review-model";
import {
  ReviewAddressValue,
  ReviewBlock,
  ReviewRow,
  sbBtnDanger,
  sbBtnDangerSoft,
  sbBtnPrimary,
  sbBtnSecondary,
  sbBtnWarn,
} from "@/components/admin/stores/admin-store-review-ui";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import {
  resolveStoreTaxonomyPrimaryDisplayName,
  resolveStoreTaxonomyTopicDisplayName,
} from "@/lib/stores/resolve-store-taxonomy-display-name";
import { AdminStoreDiscoverySnapshotPanel } from "@/components/admin/stores/AdminStoreDiscoverySnapshotPanel";

function embedRelation(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): TaxonomyRelation | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function embedRelationName(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): string {
  const rel = embedRelation(v);
  return String(rel?.name ?? "").trim();
}

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || "—";
}


/** 표준 CTA 이름 · 확인 등급 (R1) — 입점 심사 화면과 매장 상세가 같은 표를 쓴다. */
type StoreActionCopy = {
  level: AdminConfirmLevel;
  ko: string;
  en: string;
  titleKo: string;
  titleEn: string;
  descKo?: string;
  descEn?: string;
  destructive?: boolean;
  successKo: string;
  successEn: string;
};

export const ADMIN_STORE_ACTION_COPY: Record<string, StoreActionCopy> = {
  start_review: {
    level: "L1",
    ko: "심사 시작",
    en: "Start review",
    titleKo: "이 매장 심사를 시작할까요?",
    titleEn: "Start reviewing this store?",
    successKo: "심사를 시작했습니다.",
    successEn: "Review started.",
  },
  approve_store: {
    level: "L1",
    ko: "입점 승인",
    en: "Approve store",
    titleKo: "입점을 승인할까요?",
    titleEn: "Approve this store?",
    descKo: "승인 후 영업을 시작하려면 판매 승인과 노출 켜기가 필요합니다. 사장님에게 자동으로 알림이 갑니다.",
    descEn: "After approval, sales approval and visibility are still needed to open. The owner is notified automatically.",
    successKo: "입점을 승인했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Store approved. The owner was notified.",
  },
  reject_store: {
    level: "L2",
    ko: "입점 거절",
    en: "Reject store",
    titleKo: "입점을 거절할까요?",
    titleEn: "Reject this store?",
    descKo: "거절 사유는 사장님에게 알림으로 전달됩니다.",
    descEn: "The reason is sent to the owner.",
    destructive: true,
    successKo: "입점을 거절했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Store rejected. The owner was notified.",
  },
  request_revision: {
    level: "L2",
    ko: "보완 요청",
    en: "Request changes",
    titleKo: "신청서 보완을 요청할까요?",
    titleEn: "Request changes to the application?",
    descKo: "보완할 내용을 사유로 적어 주세요. 사장님에게 알림으로 전달됩니다.",
    descEn: "Describe what to fix. It is sent to the owner.",
    successKo: "보완을 요청했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Changes requested. The owner was notified.",
  },
  suspend_store: {
    level: "L2",
    ko: "운영 중지",
    en: "Suspend store",
    titleKo: "매장 운영을 중지할까요?",
    titleEn: "Suspend this store?",
    descKo: "고객 앱에서 매장이 보이지 않고 새 주문을 받을 수 없습니다.",
    descEn: "The store is hidden from customers and cannot take new orders.",
    destructive: true,
    successKo: "운영을 중지했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Store suspended. The owner was notified.",
  },
  resume_store: {
    level: "L1",
    ko: "운영 재개",
    en: "Resume store",
    titleKo: "매장 운영을 재개할까요?",
    titleEn: "Resume this store?",
    descKo: "중지 전 노출 상태로 되돌립니다.",
    descEn: "Visibility is restored to its state before suspension.",
    successKo: "운영을 재개했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Store resumed. The owner was notified.",
  },
  approve_sales: {
    level: "L1",
    ko: "판매 승인",
    en: "Approve sales",
    titleKo: "판매를 승인할까요?",
    titleEn: "Approve sales?",
    successKo: "판매를 승인했습니다.",
    successEn: "Sales approved.",
  },
  reject_sales: {
    level: "L2",
    ko: "판매 거절",
    en: "Reject sales",
    titleKo: "판매를 거절할까요?",
    titleEn: "Reject sales?",
    destructive: true,
    successKo: "판매를 거절했습니다.",
    successEn: "Sales rejected.",
  },
  suspend_sales: {
    level: "L2",
    ko: "판매 중지",
    en: "Suspend sales",
    titleKo: "판매를 중지할까요?",
    titleEn: "Suspend sales?",
    descKo: "매장은 보이지만 주문을 받을 수 없습니다.",
    descEn: "The store stays visible but cannot take orders.",
    destructive: true,
    successKo: "판매를 중지했습니다.",
    successEn: "Sales suspended.",
  },
};

/** 처리 성공 문구 — 표에 없는 조치는 일반 문구. */
export function adminStoreActionSuccessMessage(action: string, ko: boolean, enabled?: boolean): string {
  if (action === "set_store_visible") {
    return enabled ? (ko ? "노출을 켰습니다." : "Visibility turned on.") : ko ? "노출을 껐습니다." : "Visibility turned off.";
  }
  const c = ADMIN_STORE_ACTION_COPY[action];
  if (c) return ko ? c.successKo : c.successEn;
  return ko ? "저장했습니다." : "Saved.";
}

const APPROVAL_BUTTON_ORDER: AdminStoreApprovalAction[] = [
  "start_review",
  "approve_store",
  "request_revision",
  "reject_store",
  "suspend_store",
  "resume_store",
];

function approvalButtonClass(action: string): string {
  if (action === "approve_store" || action === "resume_store") return sbBtnPrimary;
  if (action === "reject_store") return sbBtnDanger;
  if (action === "suspend_store") return sbBtnDangerSoft;
  if (action === "request_revision") return sbBtnWarn;
  return sbBtnSecondary;
}

/** 판매 상태별 노출 버튼 (서버 전이표 없음 — 의미 없는 버튼만 숨긴다). */
function salesActionsFor(salesStatus: string | null | undefined): string[] {
  if (salesStatus === undefined) return ["approve_sales", "reject_sales", "suspend_sales"];
  const s = String(salesStatus ?? "").trim();
  if (s === "approved") return ["suspend_sales"];
  if (s === "suspended" || s === "rejected") return ["approve_sales"];
  return ["approve_sales", "reject_sales"];
}

export type AdminStoreReviewPanelProps = {
  store: AdminStoreReviewRow | null;
  onClose?: () => void;
  onRunAction?: (
    action: string,
    payload?: { reason?: string; enabled?: boolean; store_name?: string }
  ) => void | boolean | Promise<void | boolean>;
  actionBusy?: boolean;
  onSetOwnerIdentityEditable?: (enabled: boolean) => void;
  identityActionBusy?: boolean;
  /** 판매 권한 상태 (store_sales_permissions.sales_status). undefined = 모름 → 판매 버튼 모두 표시 */
  salesStatus?: string | null;
  /** 입점 승인·운영 중지 매장의 「매장 상세」 링크 (입점 심사 화면에서만 전달) */
  detailHref?: string;
};

export function AdminStoreReviewPanel({
  store,
  onClose,
  onRunAction,
  actionBusy,
  onSetOwnerIdentityEditable,
  identityActionBusy,
  salesStatus,
  detailHref,
}: AdminStoreReviewPanelProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [adminStoreName, setAdminStoreName] = useState(store?.store_name ?? "");
  const [visibleBusy, setVisibleBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);

  useEffect(() => {
    setAdminStoreName(store?.store_name ?? "");
    setNotifyResult(null);
  }, [store?.id, store?.store_name]);

  if (!store) return null;

  const approval = adminStatusLabel("store_approval", store.approval_status, ko);
  /** C-6 — 보완 요청 후 사장님 재제출로 심사 대기 복귀한 신청 (보완 요청 내용이 남아 있음). */
  const resubmitted = store.approval_status === "pending" && Boolean((store.revision_note ?? "").trim());
  const sales = salesStatus === undefined ? null : adminStatusLabel("store_sales", salesStatus, ko);
  const storeNameForCopy = (store.store_name ?? "").trim();
  const { intro: storeIntro } = splitStoreDescriptionAndKakao(store.description, store.kakao_id);
  const dateRows = buildAdminStoreDateRows(store);

  const gcashNoDigits = parsePhMobileInput(store.email ?? "");
  const gcashNoDisplay =
    gcashNoDigits.length === 11 ? formatPhMobileDisplay(gcashNoDigits) : dash(store.email);

  const catRel = embedRelation(store.store_categories);
  const topicRel = embedRelation(store.store_topics);
  const catDb = catRel?.slug
    ? resolveStoreTaxonomyPrimaryDisplayName(language, catRel.slug, String(catRel.name ?? ""), catRel.name_en)
    : embedRelationName(store.store_categories);
  const topicDb = topicRel?.slug
    ? resolveStoreTaxonomyTopicDisplayName(language, topicRel.slug, String(topicRel.name ?? ""), topicRel.name_en)
    : embedRelationName(store.store_topics);

  const profileUrl = store.profile_image_url?.trim();
  const busy = Boolean(actionBusy || identityActionBusy || visibleBusy || notifyBusy);

  const sendOwnerNotice = async () => {
    const title =
      (await dibayPrompt({ title: t("admin_stores_notify_title_prompt"), defaultValue: "" }))?.trim() ||
      "";
    if (!title) return;
    const body =
      (await dibayPrompt({
        title: t("admin_stores_notify_body_prompt"),
        defaultValue: "",
      }))?.trim() || "";
    if (!body) return;
    setNotifyBusy(true);
    setNotifyResult(null);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(store.id)}/notify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setNotifyResult({ ok: false, code: res.status === 403 ? "forbidden" : "notification_failed" });
        return;
      }
      setNotifyResult({ ok: true, message: t("admin_stores_notify_sent") });
    } catch {
      setNotifyResult({ ok: false, code: "network_error" });
    } finally {
      setNotifyBusy(false);
    }
  };

  /** 모든 결정은 확인 팝업(L1/L2)을 거친다. L2 사유는 API `reason` 으로 전송. */
  const runConfirmedAction = async (action: string): Promise<void> => {
    const c = ADMIN_STORE_ACTION_COPY[action];
    if (!c || !onRunAction) return;
    const confirmed = await confirmAdminAction({
      level: c.level,
      ko,
      title: storeNameForCopy ? `${ko ? c.titleKo : c.titleEn} · ${storeNameForCopy}` : ko ? c.titleKo : c.titleEn,
      description: ko ? c.descKo : c.descEn,
      confirmLabel: ko ? c.ko : c.en,
      destructive: c.destructive,
      reasonPlaceholder: c.level === "L2" ? (ko ? "사장님에게 전달될 사유" : "Reason sent to the owner") : undefined,
    });
    if (!confirmed.ok) return;
    await onRunAction(action, confirmed.reason ? { reason: confirmed.reason } : undefined);
  };

  const approvalActions = APPROVAL_BUTTON_ORDER.filter((a) =>
    allowedStoreApprovalActions(store.approval_status).includes(a)
  );
  const salesActions = store.approval_status === "approved" ? salesActionsFor(salesStatus) : [];
  const salesApproved = String(salesStatus ?? "").trim() === "approved";

  const visibilityValue =
    store.approval_status === "approved" && onRunAction ? (
      <div className="flex items-center gap-2">
        <StoreOpsOnOffSwitch
          checked={store.is_visible}
          disabled={busy}
          onCheckedChange={async (next) => {
            const confirmed = await confirmAdminAction({
              level: "L1",
              ko,
              title: next
                ? ko
                  ? "고객 앱에 매장을 노출할까요?"
                  : "Show this store to customers?"
                : ko
                  ? "고객 앱에서 매장을 숨길까요?"
                  : "Hide this store from customers?",
              confirmLabel: next ? (ko ? "노출 켜기" : "Turn on") : ko ? "노출 끄기" : "Turn off",
              destructive: !next,
            });
            if (!confirmed.ok) return false;
            setVisibleBusy(true);
            try {
              const result = await Promise.resolve(onRunAction("set_store_visible", { enabled: next }));
              return result !== false;
            } finally {
              setVisibleBusy(false);
            }
          }}
          ariaLabel={
            store.is_visible ? t("admin_stores_visible_toggle_aria_off") : t("admin_stores_visible_toggle_aria_on")
          }
        />
        <span className="text-[13px] text-[#6B6B6B]">
          {store.is_visible ? t("admin_stores_visible_y") : t("admin_stores_visible_n")}
        </span>
      </div>
    ) : store.is_visible ? (
      t("admin_stores_visible_y")
    ) : (
      t("admin_stores_visible_n")
    );

  return (
    <div>
      <ReviewBlock title={ko ? "상태" : "Status"}>
        <ReviewRow
          label={ko ? "심사 상태" : "Review"}
          value={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <AdminToneBadge tone={approval.tone}>{approval.label}</AdminToneBadge>
              {resubmitted ? <AdminToneBadge tone="warning">{t("admin_r4a_resubmitted_badge")}</AdminToneBadge> : null}
            </span>
          }
        />
        {resubmitted ? (
          <p className="py-1 text-[12px] text-[#6B6B6B]" data-admin-store-resubmitted="1">
            {t("admin_r4a_resubmitted_hint")}
          </p>
        ) : null}
        {sales && store.approval_status === "approved" ? (
          <ReviewRow
            label={ko ? "판매 상태" : "Sales"}
            value={<AdminToneBadge tone={sales.tone}>{sales.label}</AdminToneBadge>}
          />
        ) : null}
        <ReviewRow label={ko ? "노출 상태" : "Visibility"} value={visibilityValue} />
        {dateRows.map((row) => (
          <ReviewRow key={row.label} label={row.label} value={row.value} />
        ))}
        {detailHref && (store.approval_status === "approved" || store.approval_status === "suspended") ? (
          <div className="py-2">
            <Link href={detailHref} className={sbBtnSecondary}>
              {ko ? "매장 상세" : "Store detail"}
            </Link>
          </div>
        ) : null}
      </ReviewBlock>

      {store.approval_status === "approved" ? (
        <ReviewBlock title={ko ? "영업 개시 체크리스트" : "Go-live checklist"}>
          <ol className="space-y-1.5 py-2 text-[13px]" data-admin-store-golive-checklist="1">
            <li className="flex items-center gap-2">
              <AdminToneBadge tone="success">✓</AdminToneBadge>
              <span>{ko ? "1. 입점 승인" : "1. Store approved"}</span>
            </li>
            <li className="flex items-center gap-2">
              <AdminToneBadge tone={salesStatus === undefined ? "neutral" : salesApproved ? "success" : "waiting"}>
                {salesStatus === undefined ? "?" : salesApproved ? "✓" : ko ? "대기" : "To do"}
              </AdminToneBadge>
              <span>{ko ? "2. 판매 승인" : "2. Approve sales"}</span>
            </li>
            <li className="flex items-center gap-2">
              <AdminToneBadge tone={store.is_visible ? "success" : "waiting"}>
                {store.is_visible ? "✓" : ko ? "대기" : "To do"}
              </AdminToneBadge>
              <span>{ko ? "3. 노출 켜기" : "3. Turn visibility on"}</span>
            </li>
          </ol>
          <p className="pb-2 text-[12px] text-[#6B6B6B]">
            {ko
              ? "세 단계가 모두 끝나야 고객 앱에서 매장이 보이고 주문을 받을 수 있습니다."
              : "All three steps are required before customers can see and order from the store."}
          </p>
        </ReviewBlock>
      ) : null}

      {onRunAction ? (
        <ReviewBlock title="운영">
          <div className="py-2">
            <ReviewRow
              label={ko ? "매장명" : "Store name"}
              value={
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={adminStoreName}
                    onChange={(e) => setAdminStoreName(e.target.value)}
                    className="min-w-[12rem] flex-1 rounded-sm border border-[#D4C5B9] bg-white px-2.5 py-1.5 text-[#1E3932] outline-none focus:border-[#00704A]"
                    placeholder={t("admin_stores_field_store_name_ph")}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    disabled={busy || adminStoreName.trim().length < 2}
                    onClick={async () => {
                      const confirmed = await confirmAdminAction({
                        level: "L1",
                        ko,
                        title: ko ? "매장명을 변경할까요?" : "Change the store name?",
                        description: adminStoreName.trim(),
                        confirmLabel: ko ? "저장" : "Save",
                      });
                      if (!confirmed.ok) return;
                      await onRunAction("set_store_name", { store_name: adminStoreName.trim() });
                    }}
                    className={sbBtnPrimary}
                  >
                    {t("admin_stores_save_store_name")}
                  </button>
                </div>
              }
            />
            {onSetOwnerIdentityEditable ? (
              <ReviewRow
                label={ko ? "사장님 매장명 수정" : "Owner name edit"}
                value={
                  <button
                    type="button"
                    disabled={identityActionBusy}
                    onClick={async () => {
                      const next = !store.owner_can_edit_store_identity;
                      const confirmed = await confirmAdminAction({
                        level: "L1",
                        ko,
                        title: next
                          ? ko
                            ? "사장님이 매장명을 직접 수정하도록 허용할까요?"
                            : "Allow the owner to edit the store name?"
                          : ko
                            ? "사장님의 매장명 수정을 막을까요?"
                            : "Block the owner from editing the store name?",
                        confirmLabel: ko ? "저장" : "Save",
                      });
                      if (!confirmed.ok) return;
                      onSetOwnerIdentityEditable(next);
                    }}
                    className={`rounded-sm border px-2.5 py-0.5 text-[13px] font-medium disabled:opacity-50 ${
                      store.owner_can_edit_store_identity
                        ? "border-[#A5D6A7] bg-[#E8F5E9] text-[#1B5E20]"
                        : "border-[#D4C5B9] bg-[#F2F0EB] text-[#6B6B6B]"
                    }`}
                  >
                    {identityActionBusy
                      ? t("common_processing")
                      : store.owner_can_edit_store_identity
                        ? ko
                          ? "허용"
                          : "Allowed"
                        : ko
                          ? "차단"
                          : "Blocked"}
                  </button>
                }
              />
            ) : null}
          </div>

          <div className="border-t border-[#E8E2D8]/80 py-3">
            <p className="text-[12px] text-[#6B6B6B]">
              {ko
                ? "입점·운영 결정을 하면 사장님에게 자동으로 알림이 갑니다. 거절·보완·중지는 사유를 입력해야 합니다."
                : "The owner is notified automatically of store decisions. Reject, changes, and suspend require a reason."}
            </p>
            {approvalActions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2" data-admin-store-approval-actions="1">
                {approvalActions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    className={approvalButtonClass(a)}
                    onClick={() => void runConfirmedAction(a)}
                  >
                    {ko ? ADMIN_STORE_ACTION_COPY[a].ko : ADMIN_STORE_ACTION_COPY[a].en}
                  </button>
                ))}
              </div>
            ) : null}
            {salesActions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2" data-admin-store-sales-actions="1">
                {salesActions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    className={a === "approve_sales" ? sbBtnPrimary : a === "suspend_sales" ? sbBtnWarn : sbBtnSecondary}
                    onClick={() => void runConfirmedAction(a)}
                  >
                    {ko ? ADMIN_STORE_ACTION_COPY[a].ko : ADMIN_STORE_ACTION_COPY[a].en}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={sbBtnSecondary} onClick={() => void sendOwnerNotice()}>
                {ko ? "사장님에게 알림 보내기" : "Send owner a notice"}
              </button>
            </div>
            {notifyResult ? (
              <div className="mt-2">
                <AdminResultBanner ko={ko} result={notifyResult} onClose={() => setNotifyResult(null)} />
              </div>
            ) : null}
          </div>
        </ReviewBlock>
      ) : null}

      <ReviewBlock title={t("admin_stores_section_applicant")}>
        <ReviewRow
          label={t("admin_stores_field_nickname")}
          value={dash(store.applicant_nickname)}
        />
        <ReviewRow
          label={t("admin_stores_field_owner_handle")}
          value={dash(store.owner_handle || store.owner_username)}
        />
      </ReviewBlock>

      <ReviewBlock title={ko ? "신청 정보" : "Application"}>
        <ReviewRow label={ko ? "GCash 번호" : "GCash number"} value={gcashNoDisplay} />
        <ReviewRow label={ko ? "GCash 계정 이름" : "GCash account name"} value={dash(store.website_url)} />
        <ReviewRow label={t("admin_stores_field_category_primary")} value={catDb || "—"} />
        <ReviewRow label={t("admin_stores_field_category_secondary")} value={topicDb || "—"} />
        <ReviewRow label={ko ? "매장 주소" : "Address"} value={<ReviewAddressValue store={store} />} />
        {storeIntro?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_intro")}
            value={<span className="whitespace-pre-wrap">{storeIntro.trim()}</span>}
          />
        ) : null}
        {store.application_request_note?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_request_note")}
            value={<span className="whitespace-pre-wrap">{store.application_request_note.trim()}</span>}
          />
        ) : null}
        {store.revision_note?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_revision")}
            value={<span className="whitespace-pre-wrap text-[#F57F17]">{store.revision_note.trim()}</span>}
          />
        ) : null}
        {store.rejected_reason?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_reject_reason")}
            value={<span className="whitespace-pre-wrap text-[#B71C1C]">{store.rejected_reason.trim()}</span>}
          />
        ) : null}
        {store.suspended_reason?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_suspend_reason")}
            value={<span className="whitespace-pre-wrap">{store.suspended_reason.trim()}</span>}
          />
        ) : null}
        {profileUrl ? (
          <ReviewRow
            label={t("admin_stores_image_profile")}
            value={
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-sm border border-[#D4C5B9]">
                <img src={profileUrl} alt="" className="max-h-40 w-full object-cover" />
              </a>
            }
          />
        ) : null}
      </ReviewBlock>

      <AdminStoreDiscoverySnapshotPanel storeId={store.id} />

      <div className="px-4 pb-2">
        <AdminTechDetails ko={ko}>
          <div>store_id: {store.id}</div>
          <div>slug: {store.slug || "—"}</div>
          <div>owner_user_id: {store.owner_user_id || "—"}</div>
        </AdminTechDetails>
      </div>

      {onClose ? (
        <div className="flex justify-end border-t border-[#D4C5B9] px-4 py-2">
          <button type="button" onClick={onClose} className={sbBtnSecondary}>
            {t("common_close")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
