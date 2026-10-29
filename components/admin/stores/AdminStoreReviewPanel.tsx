"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink, type AdminActionVariant } from "@/components/admin/ui/AdminActionButton";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction, type AdminConfirmLevel } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
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
} from "@/components/admin/stores/admin-store-review-ui";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import {
  resolveStoreTaxonomyPrimaryDisplayName,
  resolveStoreTaxonomyTopicDisplayName,
} from "@/lib/stores/resolve-store-taxonomy-display-name";
import { AdminStoreDiscoverySnapshotPanel } from "@/components/admin/stores/AdminStoreDiscoverySnapshotPanel";
import { isStoreCoreInfoPendingReverification } from "@/lib/stores/store-core-info-reverification";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

function embedRelation(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): TaxonomyRelation | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function embedRelationName(v: TaxonomyRelation | TaxonomyRelation[] | null | undefined): string {
  const rel = embedRelation(v);
  return String(rel?.name ?? "").trim();
}

function newNoticeRequestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "";
}

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || "—";
}


/** 표준 CTA 이름 · 확인 등급 (R2 동작 표 `adminActionLevel`) — 입점 심사 화면과 매장 상세가 같은 표를 쓴다. */
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
    level: adminActionLevel("save"),
    ko: "심사 시작",
    en: "Start review",
    titleKo: "이 매장 심사를 시작할까요?",
    titleEn: "Start reviewing this store?",
    successKo: "심사를 시작했습니다.",
    successEn: "Review started.",
  },
  approve_store: {
    level: adminActionLevel("approve"),
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
    level: adminActionLevel("reject"),
    ko: "입점 반려",
    en: "Reject store",
    titleKo: "입점을 반려할까요?",
    titleEn: "Reject this store?",
    descKo: "반려 사유는 사장님에게 알림으로 전달됩니다.",
    descEn: "The reason is sent to the owner.",
    destructive: true,
    successKo: "입점을 반려했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Store rejected. The owner was notified.",
  },
  request_revision: {
    level: adminActionLevel("reject"),
    ko: "보완 요청",
    en: "Request changes",
    titleKo: "신청서 보완을 요청할까요?",
    titleEn: "Request changes to the application?",
    descKo: "보완할 내용을 사유로 적어 주세요. 사장님에게 알림으로 전달됩니다.",
    descEn: "Describe what to fix. It is sent to the owner.",
    successKo: "보완을 요청했습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Changes requested. The owner was notified.",
  },
  reopen_application: {
    level: adminActionLevel("approve"),
    ko: "재심사 열기",
    en: "Reopen review",
    titleKo: "반려된 신청의 재심사를 열까요?",
    titleEn: "Reopen this rejected application?",
    descKo: "보완 요청 상태로 바뀌어 사장님이 신청 내용을 고쳐 다시 제출할 수 있습니다. 사유(보완할 내용)는 사장님에게 알림으로 전달됩니다.",
    descEn: "The application returns to 'changes requested' so the owner can fix and resubmit it. The reason is sent to the owner.",
    successKo: "재심사를 열었습니다. 사장님에게 알림을 보냈습니다.",
    successEn: "Review reopened. The owner was notified.",
  },
  confirm_core_info_reverified: {
    level: adminActionLevel("save"),
    ko: "재검증 완료",
    en: "Mark re-verified",
    titleKo: "변경된 매장 주소·위치를 확인했나요?",
    titleEn: "Have you verified the changed store address and location?",
    descKo: "재검증 표시가 해제됩니다. 처리 기록은 감사 이력에 남습니다.",
    descEn: "The re-verification flag is cleared. The action is recorded in the audit log.",
    successKo: "재검증을 완료했습니다.",
    successEn: "Marked as re-verified.",
  },
  suspend_store: {
    level: adminActionLevel("sanction"),
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
    level: adminActionLevel("resume"),
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
    level: adminActionLevel("approve"),
    ko: "판매 승인",
    en: "Approve sales",
    titleKo: "판매를 승인할까요?",
    titleEn: "Approve sales?",
    successKo: "판매를 승인했습니다.",
    successEn: "Sales approved.",
  },
  reject_sales: {
    level: adminActionLevel("reject"),
    ko: "판매 반려",
    en: "Reject sales",
    titleKo: "판매를 반려할까요?",
    titleEn: "Reject sales?",
    destructive: true,
    successKo: "판매를 반려했습니다.",
    successEn: "Sales rejected.",
  },
  suspend_sales: {
    level: adminActionLevel("sanction"),
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

/**
 * 입점·판매 결정 확인 팝업 (동작 표 단계 · L2/L3 사유) — 심사 패널과 입점 심사 표의 행 버튼(5-E)이 같은 확인을 쓴다.
 */
export async function confirmAdminStoreAction(
  action: string,
  ko: boolean,
  storeName?: string | null
): Promise<{ ok: true; reason?: string } | { ok: false }> {
  const c = ADMIN_STORE_ACTION_COPY[action];
  if (!c) return { ok: false };
  const name = (storeName ?? "").trim();
  const confirmed = await confirmAdminAction({
    level: c.level,
    ko,
    title: name ? `${ko ? c.titleKo : c.titleEn} · ${name}` : ko ? c.titleKo : c.titleEn,
    description: ko ? c.descKo : c.descEn,
    confirmLabel: ko ? c.ko : c.en,
    destructive: c.destructive,
    reasonPlaceholder: c.level !== "L1" ? (ko ? "사장님에게 전달될 사유" : "Reason sent to the owner") : undefined,
  });
  if (!confirmed.ok) return { ok: false };
  return confirmed.reason ? { ok: true, reason: confirmed.reason } : { ok: true };
}

const APPROVAL_BUTTON_ORDER: AdminStoreApprovalAction[] = [
  "start_review",
  "approve_store",
  "request_revision",
  "reject_store",
  "reopen_application",
  "suspend_store",
  "resume_store",
];

/**
 * 버튼 표준 (R7 3번) — 패널의 primary 는 입점 결정(승인·재개) 1개뿐.
 * 반려·중지는 다시 승인·재개로 되돌릴 수 있어 danger 가 아니라 secondary (확인 단계는 그대로 L2 사유).
 */
function approvalButtonVariant(action: string): AdminActionVariant {
  if (action === "approve_store" || action === "resume_store") return "primary";
  return "secondary";
}

function salesButtonVariant(_action: string): AdminActionVariant {
  return "secondary";
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
    payload?: { reason?: string; enabled?: boolean; store_name?: string } & Record<string, unknown>
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
  /** N-14 — 같은 작성분의 연타·재시도는 서버 dedupe 로 1회만 발송 */
  const noticeRequestIdRef = useRef<string>(newNoticeRequestId());
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [notifyResult, setNotifyResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);

  useEffect(() => {
    setAdminStoreName(store?.store_name ?? "");
    setNotifyResult(null);
    setNoticeOpen(false);
    setNoticeTitle("");
    setNoticeBody("");
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
    const title = noticeTitle.trim();
    const body = noticeBody.trim();
    if (!title || !body) return;
    setNotifyBusy(true);
    setNotifyResult(null);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(store.id)}/notify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, request_id: noticeRequestIdRef.current }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setNotifyResult({ ok: false, code: res.status === 403 ? "forbidden" : "notification_failed" });
        return;
      }
      setNotifyResult({ ok: true, message: t("admin_stores_notify_sent") });
      setNoticeOpen(false);
      setNoticeTitle("");
      setNoticeBody("");
      noticeRequestIdRef.current = newNoticeRequestId();
    } catch {
      setNotifyResult({ ok: false, code: "network_error" });
    } finally {
      setNotifyBusy(false);
    }
  };

  /** 모든 결정은 확인 팝업(동작 표 단계)을 거친다. L2·L3 사유는 API `reason` 으로 전송. */
  const runConfirmedAction = async (action: string, extra?: Record<string, unknown>): Promise<void> => {
    if (!ADMIN_STORE_ACTION_COPY[action] || !onRunAction) return;
    const confirmed = await confirmAdminStoreAction(action, ko, storeNameForCopy);
    if (!confirmed.ok) return;
    const payload = { ...(extra ?? {}), ...(confirmed.reason ? { reason: confirmed.reason } : {}) };
    await onRunAction(action, Object.keys(payload).length > 0 ? payload : undefined);
  };

  const coreInfoPending =
    store.approval_status === "approved" && isStoreCoreInfoPendingReverification(store.core_info_review_status);

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
            // 노출 켜기 = 노출 시작(L2 · 사유 전송), 노출 끄기 = 노출 중지(L1).
            const confirmed = await confirmAdminAction({
              level: adminActionLevel(next ? "exposeStart" : "exposeStop"),
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
              const result = await Promise.resolve(
                onRunAction("set_store_visible", {
                  enabled: next,
                  ...(confirmed.reason ? { reason: confirmed.reason } : {}),
                })
              );
              return result !== false;
            } finally {
              setVisibleBusy(false);
            }
          }}
          ariaLabel={
            store.is_visible ? t("admin_stores_visible_toggle_aria_off") : t("admin_stores_visible_toggle_aria_on")
          }
        />
        <span className="text-[13px] text-sam-muted">
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
          <p className="py-1 text-[12px] text-sam-muted" data-admin-store-resubmitted="1">
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
            <AdminActionLink href={detailHref} variant="secondary">
              {ko ? "매장 상세" : "Store detail"}
            </AdminActionLink>
          </div>
        ) : null}
      </ReviewBlock>

      {coreInfoPending ? (
        <ReviewBlock title={ko ? "주소·위치 재검증" : "Address re-verification"}>
          <div className="py-2 text-[13px]" data-admin-store-core-info-reverification="1">
            <div className="flex flex-wrap items-center gap-1.5">
              <AdminToneBadge tone="warning">{ko ? "재검증 필요" : "Needs re-verification"}</AdminToneBadge>
              {store.core_info_changed_at ? (
                <span className="text-sam-muted">{formatAdminManilaDateTime(store.core_info_changed_at)}</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[12px] text-sam-muted">
              {ko
                ? "승인 후 사장님이 매장 주소·위치를 바꿨습니다. 변경은 이미 반영되어 영업 중입니다. 아래 신청 정보의 주소와 지도 위치를 확인한 뒤 재검증을 완료하세요."
                : "The owner changed the store address or location after approval. The change is already live. Check the address and map pin below, then mark it re-verified."}
            </p>
            {store.core_info_changed_fields && store.core_info_changed_fields.length > 0 ? (
              <p className="mt-1 text-[12px] text-sam-muted">
                {ko ? "변경 항목" : "Changed"}: {store.core_info_changed_fields.join(", ")}
              </p>
            ) : null}
            {onRunAction ? (
              <div className="mt-2">
                <AdminActionButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runConfirmedAction("confirm_core_info_reverified", {
                      expected_core_info_changed_at: store.core_info_changed_at ?? null,
                    })
                  }
                >
                  {ko
                    ? ADMIN_STORE_ACTION_COPY.confirm_core_info_reverified.ko
                    : ADMIN_STORE_ACTION_COPY.confirm_core_info_reverified.en}
                </AdminActionButton>
              </div>
            ) : null}
          </div>
        </ReviewBlock>
      ) : null}

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
          <p className="pb-2 text-[12px] text-sam-muted">
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
                    className="min-w-[12rem] flex-1 rounded-sm border border-sam-border bg-white px-2.5 py-1.5 text-sam-fg outline-none focus:border-sam-primary"
                    placeholder={t("admin_stores_field_store_name_ph")}
                    disabled={busy}
                  />
                  <AdminActionButton
                    variant="secondary"
                    size="sm"
                    disabled={busy || adminStoreName.trim().length < 2}
                    onClick={async () => {
                      const confirmed = await confirmAdminAction({
                        level: adminActionLevel("save"),
                        ko,
                        title: ko ? "매장명을 변경할까요?" : "Change the store name?",
                        description: adminStoreName.trim(),
                        confirmLabel: ko ? "저장" : "Save",
                      });
                      if (!confirmed.ok) return;
                      await onRunAction("set_store_name", { store_name: adminStoreName.trim() });
                    }}
                  >
                    {t("admin_stores_save_store_name")}
                  </AdminActionButton>
                </div>
              }
            />
            {onSetOwnerIdentityEditable ? (
              <ReviewRow
                label={ko ? "사장님 매장명 수정" : "Owner name edit"}
                value={
                  <AdminActionButton
                    variant="secondary"
                    size="sm"
                    aria-pressed={Boolean(store.owner_can_edit_store_identity)}
                    disabled={identityActionBusy}
                    onClick={async () => {
                      const next = !store.owner_can_edit_store_identity;
                      const confirmed = await confirmAdminAction({
                        level: adminActionLevel("save"),
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
                    className={store.owner_can_edit_store_identity ? "text-sam-success" : "text-sam-muted"}
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
                  </AdminActionButton>
                }
              />
            ) : null}
          </div>

          <div className="border-t border-sam-border-soft/80 py-3">
            <p className="text-[12px] text-sam-muted">
              {ko
                ? "입점·운영 결정을 하면 사장님에게 자동으로 알림이 갑니다. 승인·반려·보완·중지는 사유를 입력해야 합니다."
                : "The owner is notified automatically of store decisions. Approve, reject, changes, and suspend require a reason."}
            </p>
            {approvalActions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2" data-admin-store-approval-actions="1">
                {approvalActions.map((a) => (
                  <AdminActionButton
                    key={a}
                    variant={approvalButtonVariant(a)}
                    disabled={busy}
                    onClick={() => void runConfirmedAction(a)}
                  >
                    {ko ? ADMIN_STORE_ACTION_COPY[a].ko : ADMIN_STORE_ACTION_COPY[a].en}
                  </AdminActionButton>
                ))}
              </div>
            ) : null}
            {salesActions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2" data-admin-store-sales-actions="1">
                {salesActions.map((a) => (
                  <AdminActionButton
                    key={a}
                    variant={salesButtonVariant(a)}
                    disabled={busy}
                    onClick={() => void runConfirmedAction(a)}
                  >
                    {ko ? ADMIN_STORE_ACTION_COPY[a].ko : ADMIN_STORE_ACTION_COPY[a].en}
                  </AdminActionButton>
                ))}
              </div>
            ) : null}
            {noticeOpen ? (
              <div className="mt-2 space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface-muted p-3" data-admin-store-owner-notice-form="1">
                <label className="block text-[13px] font-medium text-sam-fg">
                  {t("admin_stores_notify_title_prompt")}
                  <input
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[14px] text-sam-fg outline-none focus:border-sam-primary"
                  />
                </label>
                <label className="block text-[13px] font-medium text-sam-fg">
                  {t("admin_stores_notify_body_prompt")}
                  <textarea
                    value={noticeBody}
                    onChange={(e) => setNoticeBody(e.target.value)}
                    disabled={busy}
                    rows={3}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[14px] text-sam-fg outline-none focus:border-sam-primary"
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <AdminActionButton variant="secondary" disabled={notifyBusy} onClick={() => setNoticeOpen(false)}>
                    {adminCta("cancel", ko)}
                  </AdminActionButton>
                  <AdminActionButton
                    variant="secondary"
                    disabled={busy || !noticeTitle.trim() || !noticeBody.trim()}
                    onClick={() => void sendOwnerNotice()}
                  >
                    {ko ? "알림 보내기" : "Send notice"}
                  </AdminActionButton>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <AdminActionButton variant="secondary" disabled={busy} onClick={() => setNoticeOpen(true)}>
                  {ko ? "사장님에게 알림 보내기" : "Send owner a notice"}
                </AdminActionButton>
              </div>
            )}
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
            value={<span className="whitespace-pre-wrap text-sam-warning">{store.revision_note.trim()}</span>}
          />
        ) : null}
        {store.rejected_reason?.trim() ? (
          <ReviewRow
            label={t("admin_stores_section_reject_reason")}
            value={<span className="whitespace-pre-wrap text-sam-danger">{store.rejected_reason.trim()}</span>}
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
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-sm border border-sam-border">
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
        <div className="flex justify-start border-t border-sam-border px-4 py-2">
          <AdminActionButton variant="secondary" onClick={onClose}>
            {adminCta("close", ko)}
          </AdminActionButton>
        </div>
      ) : null}
    </div>
  );
}
