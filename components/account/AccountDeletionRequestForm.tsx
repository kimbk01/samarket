"use client";

import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { useMyScreenBackGuard } from "@/components/mypage/ds/MyScreen";
import {
  ACCOUNT_DELETION_CONFIRMATION_TOKEN,
  ACCOUNT_DELETION_REASON_MAX,
} from "@/lib/account/account-deletion-contract";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { Sam } from "@/lib/ui/sam-component-classes";

type Props = {
  source: "mypage_settings" | "web_delete_request";
};

export type LeaveRequestPostResult = { ok: true; requestedAt: string } | { ok: false };

/**
 * POST `/api/me/leave-request` — 내정보 탈퇴(S19)는 확인 시트 승인 시 공용 상수를 `confirmationText` 로 보낸다.
 * 서버 원문 오류는 화면에 노출하지 않는다(호출부가 i18n 문구로 표시).
 */
export async function postMypageLeaveRequest(reason: string): Promise<LeaveRequestPostResult> {
  try {
    const res = await fetch("/api/me/leave-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        confirmationText: ACCOUNT_DELETION_CONFIRMATION_TOKEN,
        reason: reason.trim() || null,
        source: "mypage_settings",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; requestedAt?: string };
    if (!res.ok || !json.ok) return { ok: false };
    return {
      ok: true,
      requestedAt: typeof json.requestedAt === "string" ? json.requestedAt : new Date().toISOString(),
    };
  } catch {
    return { ok: false };
  }
}

/**
 * 내정보 탈퇴 (최종 설계 S19) — 사라지는 것 → 보관되는 것 → 사유(선택) → 동의 체크 → 하단 고정 [취소]/[탈퇴 요청](danger).
 * 단어 입력 대신 확인 시트. 사유·동의 입력 후 뒤로 → 미저장 확인.
 */
function MypageLeaveRequestForm() {
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const stickyCtaBodyClearanceClass = resolveMyStickyCtaBodyClearanceClass(useBottomNavOccupiesClearance());
  const { t } = useI18n();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const { run, pending } = useMypageSubmitGuard();
  const dirty = !submittedAt && (agreed || reason.trim().length > 0);

  useMyScreenBackGuard(
    dirty
      ? () => {
          setLeaveConfirmOpen(true);
          return true;
        }
      : null,
  );
  useOverlayHardwareBack(dirty && !leaveConfirmOpen && !confirmOpen, () => setLeaveConfirmOpen(true));

  const submit = () =>
    run(async () => {
      if (!agreed || submittedAt) return;
      const result = await postMypageLeaveRequest(reason);
      if (!result.ok) {
        showMypageToast(t("ui_account_delete_submit_err"), "error");
        return;
      }
      setSubmittedAt(result.requestedAt);
    });

  const goHome = () => router.push(MYPAGE_MAIN_HREF);

  return (
    <div className={`space-y-2 ${stickyCtaBodyClearanceClass}`} data-testid="mypage-leave-form">
      <MyGroup title={t("ui_account_delete_data_title")}>
        <ul className="list-disc space-y-1 px-4 py-3 pl-8 sam-text-body-secondary text-sam-muted md:px-5 md:pl-9">
          <li>{t("ui_account_delete_data_1")}</li>
          <li>{t("ui_account_delete_data_2")}</li>
          <li>{t("ui_account_delete_data_3")}</li>
        </ul>
      </MyGroup>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-warning-soft p-4">
        <p className="sam-text-body font-semibold text-sam-fg">{t("ui_account_retain_title")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-fg">
          <li>{t("ui_account_retain_1")}</li>
          <li>{t("ui_account_retain_2")}</li>
          <li>{t("ui_account_retain_3")}</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
        <label htmlFor="mypage-leave-reason" className="block text-[13px] font-semibold text-sam-fg">
          {t("ui_account_delete_reason_label")}
        </label>
        <textarea
          id="mypage-leave-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, ACCOUNT_DELETION_REASON_MAX))}
          rows={4}
          maxLength={ACCOUNT_DELETION_REASON_MAX}
          disabled={submittedAt != null}
          className={`${Sam.input.textarea} ${Sam.focusRing} mt-1 w-full rounded-ui-rect text-[16px]`}
          placeholder={t("ui_account_delete_reason_ph")}
        />
      </div>

      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
        <input
          type="checkbox"
          checked={agreed}
          disabled={submittedAt != null}
          onChange={(e) => setAgreed(e.target.checked)}
          data-testid="mypage-leave-agree"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--sam-danger)]"
        />
        <span className="sam-text-body text-sam-fg">{t("mypage_s19_agree_label")}</span>
      </label>

      {submittedAt ? (
        <div
          className="rounded-ui-rect border border-sam-success/30 bg-sam-success-soft p-4"
          role="status"
          data-testid="mypage-leave-submitted"
        >
          <p className="sam-text-body font-medium text-sam-success">{t("ui_account_delete_submitted")}</p>
          <p className="mt-1 sam-text-body-secondary text-sam-fg">
            {t("ui_account_delete_submitted_at", {
              time: formatMypageDate(submittedAt, { style: "datetime" }),
            })}
          </p>
        </div>
      ) : null}

      <MyStickyCta
        dirty={agreed && !submittedAt}
        primaryTone="danger"
        primary={{
          label: t("ui_account_delete_submit"),
          onPress: () => setConfirmOpen(true),
          loading: pending,
        }}
        secondary={{ label: t("common_cancel"), onPress: () => (dirty ? setLeaveConfirmOpen(true) : goHome()) }}
      />

      <MobileConfirmBottomSheet
        open={confirmOpen}
        title={t("mypage_s19_confirm_title")}
        description={t("mypage_s19_confirm_body")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("ui_account_delete_submit")}
        confirmTone="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit();
        }}
      />
      <MobileConfirmBottomSheet
        open={leaveConfirmOpen}
        title={t("mypage_s01_discard_title")}
        cancelLabel={t("mypage_s01_discard_keep")}
        confirmLabel={t("mypage_s01_discard_confirm")}
        confirmTone="danger"
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          setAgreed(false);
          setReason("");
          goHome();
        }}
      />
    </div>
  );
}

export function AccountDeletionRequestForm({ source }: Props) {
  if (source === "mypage_settings") return <MypageLeaveRequestForm />;
  return <PublicAccountDeletionRequestForm source={source} />;
}

/** 공개 삭제 요청 페이지(`/account/delete-request`) — 현행 단어 입력·모양·동작 그대로 (S19 보존 조건) */
function PublicAccountDeletionRequestForm({ source }: Props) {
  const { t } = useI18n();
  const confirmWord = t("ui_account_delete_confirm_word");
  const [confirmationText, setConfirmationText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (confirmationText.trim() !== confirmWord) {
      setError(t("ui_account_delete_confirm_err"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          confirmationText: confirmationText.trim(),
          reason: reason.trim() || null,
          source,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requestedAt?: string;
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : t("ui_account_delete_submit_err"));
        return;
      }
      setSubmittedAt(typeof json.requestedAt === "string" ? json.requestedAt : new Date().toISOString());
    } catch {
      setError(t("ui_account_delete_submit_err"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-body font-semibold text-sam-fg">{t("ui_account_delete_data_title")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-muted">
          <li>{t("ui_account_delete_data_1")}</li>
          <li>{t("ui_account_delete_data_2")}</li>
          <li>{t("ui_account_delete_data_3")}</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4">
        <p className="sam-text-body font-semibold text-sam-fg">{t("ui_account_retain_title")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-fg">
          <li>{t("ui_account_retain_1")}</li>
          <li>{t("ui_account_retain_2")}</li>
          <li>{t("ui_account_retain_3")}</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-[13px] font-semibold text-sam-fg">{t("ui_account_delete_reason_label")}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
          placeholder={t("ui_account_delete_reason_ph")}
        />
      </div>

      <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4">
        <label className="block text-[13px] font-semibold text-red-800">{t("ui_account_delete_confirm_label")}</label>
        <p className="mt-1 sam-text-body-secondary text-red-700">{t("ui_account_delete_confirm_hint")}</p>
        <input
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          className="mt-3 w-full rounded-ui-rect border border-red-200 bg-white px-3 py-2 sam-text-body"
          placeholder={t("ui_account_delete_confirm_ph")}
        />
      </div>

      {submittedAt ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 p-4">
          <p className="sam-text-body font-medium text-emerald-800">{t("ui_account_delete_submitted")}</p>
          <p className="mt-1 sam-text-body-secondary text-emerald-700">
            {t("ui_account_delete_submitted_at", {
              time: formatMypageDate(submittedAt, { style: "datetime" }),
            })}
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4 sam-text-body-secondary text-red-600">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {source === "mypage_settings" ? (
          <Link
            href={MYPAGE_MAIN_HREF}
            className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            {t("common_cancel")}
          </Link>
        ) : null}
        <button
          type="button"
          disabled={submitting || submittedAt != null}
          onClick={() => void handleConfirm()}
          className="rounded-ui-rect bg-red-500 px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {submitting ? t("ui_account_delete_submitting") : t("ui_account_delete_submit")}
        </button>
      </div>
    </div>
  );
}
