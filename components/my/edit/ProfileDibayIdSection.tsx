"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { normalizeDibayIdInput } from "@/lib/auth/dibay-id-policy";
import {
  evaluatePublicIdProfileView,
  resolvePublicIdInputSeed,
  type ProfilePublicIdFields,
} from "@/lib/auth/dibay-public-id-ssot";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
} from "@/lib/business/owner-store-stack";
import {
  PROFILE_EDIT_FIELD_INCOMPLETE_CLASS,
} from "@/lib/ui/profile-edit-starbucks-styles";

type ReserveResp =
  | { ok: true; available: boolean; normalized: string }
  | { ok: false; error: string };

type ConfirmResp =
  | { ok: true; dibay_id: string; idempotent?: boolean }
  | { ok: false; error: string };

/** 입력이 멈춘 뒤 자동 중복 확인까지 대기(ms) — S04 */
export const DIBAY_ID_AUTO_CHECK_DEBOUNCE_MS = 400;

type ProfileDibayIdSectionProps = ProfilePublicIdFields & {
  highlighted?: boolean;
  fieldComplete?: boolean;
  /**
   * [확정] 위치 — inline(기본: 시트·설정 폼 안) / sticky(필수정보 페이지 하단 고정 `MyStickyCta`, S04)
   */
  ctaPlacement?: "inline" | "sticky";
  /**
   * page(기본) = 앱 화면 모양 · overlay = 시트 안(`EditDibayIdSheet`) — 팝업 SSOT 버튼·글자·색 (팝업 SSOT T3).
   * 동작은 같다 — 클래스만 다르다.
   */
  surface?: "page" | "overlay";
  onConfirmed: (confirmedDibayId: string) => void | Promise<void>;
};

export function ProfileDibayIdSection({
  dibay_id: dibayId,
  dibay_id_locked: dibayIdLocked,
  dibay_id_auto_assigned: dibayIdAutoAssigned,
  dibay_id_changed_once: dibayIdChangedOnce,
  username,
  username_confirmed: usernameConfirmed = null,
  highlighted = false,
  fieldComplete = true,
  ctaPlacement = "inline",
  surface = "page",
  onConfirmed,
}: ProfileDibayIdSectionProps) {
  const ov = surface === "overlay";
  /** 글자·색 — page 는 기존 값, overlay 는 팝업 글자 5단계(14·16)·팝업 토큰 */
  const cls = ov
    ? {
        helper: "text-[length:var(--overlay-body-2-size)] leading-[1.6] text-[color:var(--overlay-text-secondary)]",
        danger: "text-[length:var(--overlay-body-2-size)] font-medium leading-[1.6] text-[color:var(--overlay-danger)]",
        ok: "text-[length:var(--overlay-body-2-size)] font-medium leading-[1.6] text-[color:var(--overlay-primary)]",
        idText: "text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-text-primary)]",
      }
    : {
        helper: "text-[13px] text-sam-muted",
        danger: "text-[13px] font-medium text-sam-danger",
        ok: "text-[13px] font-medium text-sam-primary",
        idText: "text-[16px] font-semibold text-sam-fg",
      };
  const { t, safeT } = useI18n();
  const [raw, setRaw] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
  const inFlightRef = useRef(false);
  const userEditedRef = useRef(false);
  /** 자동 확인 순번 — 마지막 입력 결과만 반영(이전 요청 결과 폐기) */
  const checkSeqRef = useRef(0);

  const profileFields = useMemo(
    () => ({
      dibay_id: dibayId,
      dibay_id_locked: dibayIdLocked,
      dibay_id_auto_assigned: dibayIdAutoAssigned,
      dibay_id_changed_once: dibayIdChangedOnce,
      username,
      username_confirmed: usernameConfirmed,
    }),
    [dibayId, dibayIdAutoAssigned, dibayIdChangedOnce, dibayIdLocked, username, usernameConfirmed]
  );

  const publicIdView = useMemo(() => evaluatePublicIdProfileView(profileFields), [profileFields]);
  const inputSeed = useMemo(() => resolvePublicIdInputSeed(profileFields), [profileFields]);

  useEffect(() => {
    if (publicIdView.setupComplete || userEditedRef.current) return;
    setRaw((prev) => (prev.trim().length > 0 ? prev : inputSeed));
  }, [inputSeed, publicIdView.setupComplete]);

  const normalized = useMemo(() => normalizeDibayIdInput(raw), [raw]);

  const formVisible =
    !(!publicIdView.setupComplete && !dibayId?.trim()) &&
    !(publicIdView.setupComplete && publicIdView.atDisplay && !publicIdView.canChangeOnce) &&
    (!(publicIdView.canChangeOnce && publicIdView.atDisplay) || showChangeForm);

  /**
   * 자동 중복 확인 (S04) — 입력이 멈추고 400ms 뒤 `/api/me/dibay-id/reserve` 1회.
   * 순번 비교로 마지막 입력의 결과만 반영한다. [중복 확인] 버튼 없음.
   */
  useEffect(() => {
    const seq = ++checkSeqRef.current;
    if (!formVisible || !normalized || submitting) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/me/dibay-id/reserve", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ dibay_id: normalized }),
          });
          const json = (await res.json().catch(() => null)) as ReserveResp | null;
          if (seq !== checkSeqRef.current) return;
          if (!res.ok || !json || json.ok !== true) {
            setAvailable(null);
            setError(t("profile_edit_dibay_id_err_check_failed"));
            return;
          }
          setAvailable(json.available);
          setError(json.available ? null : t("profile_edit_dibay_id_err_duplicate"));
        } catch {
          if (seq !== checkSeqRef.current) return;
          setAvailable(null);
          setError(t("profile_edit_dibay_id_err_check_network"));
        } finally {
          if (seq === checkSeqRef.current) setChecking(false);
        }
      })();
    }, DIBAY_ID_AUTO_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 입력값·표시 상태가 바뀔 때만 재확인
  }, [normalized, formVisible]);

  const scrollInputAboveKeyboard = () => {
    window.setTimeout(() => {
      document
        .getElementById("profile-dibay-id")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  const confirm = async () => {
    if (inFlightRef.current || submitting || !normalized) return;
    inFlightRef.current = true;
    checkSeqRef.current += 1;
    setChecking(false);
    setSubmitting(true);
    setError(null);
    setAvailable(null);
    try {
      const reserveRes = await fetch("/api/me/dibay-id/reserve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dibay_id: normalized }),
      });
      const reserveJson = (await reserveRes.json().catch(() => null)) as ReserveResp | null;
      if (!reserveRes.ok || !reserveJson || reserveJson.ok !== true) {
        setError(t("profile_edit_dibay_id_err_check_failed"));
        return;
      }
      if (!reserveJson.available) {
        setAvailable(false);
        setError(t("profile_edit_dibay_id_err_duplicate"));
        return;
      }
      setAvailable(true);

      const res = await fetch("/api/me/dibay-id/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dibay_id: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ConfirmResp | null;
      if (!res.ok || !json || json.ok !== true) {
        const code = (json as { error?: string } | null)?.error ?? "";
        if (code === "dibay_id_taken") {
          setAvailable(false);
          setError(t("profile_edit_dibay_id_err_duplicate"));
        } else if (code === "dibay_id_similar_taken") {
          setAvailable(false);
          setError(
            safeT("profile_edit_dibay_id_err_similar")
          );
        } else if (code === "dibay_id_already_locked" || code === "dibay_id_change_limit") {
          setError(
            safeT("profile_edit_dibay_id_err_change_limit")
          );
        } else {
          setError(t("profile_edit_dibay_id_err_confirm_failed"));
        }
        return;
      }
      userEditedRef.current = false;
      setShowChangeForm(false);
      await onConfirmed(json.dibay_id);
    } catch {
      setError(t("profile_edit_dibay_id_err_confirm_network"));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const recoverAutoId = async () => {
    if (recovering) return;
    setRecovering(true);
    setError(null);
    try {
      const res = await fetch("/api/me/dibay-id/assign-auto", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; dibay_id?: string; error?: string } | null;
      if (!res.ok || !json?.ok || !json.dibay_id) {
        setError(
          safeT("profile_edit_dibay_id_err_recover_failed")
        );
        return;
      }
      await onConfirmed(json.dibay_id);
    } catch {
      setError(
        safeT("profile_edit_dibay_id_err_recover_failed")
      );
    } finally {
      setRecovering(false);
    }
  };

  const wrapClass = highlighted
    ? ov
      ? "rounded-[length:var(--overlay-radius-md)] ring-2 ring-[color:color-mix(in_srgb,var(--overlay-primary)_40%,transparent)] p-3 -m-1"
      : "rounded-ui-rect ring-2 ring-sam-primary/40 p-3 -m-1"
    : "";

  const controlClass = ov ? `${OverlayUi.input} !mt-0` : OWNER_STORE_PROFILE_CONTROL_CLASS;
  const inputClass = fieldComplete ? controlClass : `${controlClass} ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}`;
  const inputErrorClass = ov ? "!border-[color:var(--overlay-danger)]" : Sam.input.error;

  const canConfirm = Boolean(normalized) && available === true && !checking && !submitting;
  const confirmLabel = publicIdView.canChangeOnce
    ? safeT("profile_edit_dibay_id_change_confirm_btn")
    : t("profile_edit_dibay_id_confirm_btn");
  const showInputError = Boolean(error) || available === false;

  /** 상태 줄 — 확인 중 / 사용 가능 / 이미 사용 중·오류 */
  const statusLine = checking ? (
    <p className={cls.helper} role="status" data-testid="dibay-id-status-checking">
      {t("profile_edit_dibay_id_checking")}
    </p>
  ) : error ? (
    <p className={cls.danger} role="alert" data-testid="dibay-id-status-error">
      {error}
    </p>
  ) : available === true ? (
    <p
      className={`flex items-center gap-1 ${cls.ok}`}
      data-testid="dibay-id-status-available"
    >
      <Check className="h-4 w-4" aria-hidden />
      {t("profile_edit_dibay_id_available")}
    </p>
  ) : null;

  const confirmButton =
    ctaPlacement === "sticky" ? (
      <MyStickyCta
        dirty={canConfirm}
        primary={{
          label: confirmLabel,
          onPress: () => setConfirmSheetOpen(true),
          loading: submitting,
        }}
      />
    ) : (
      <button
        type="button"
        data-testid="dibay-id-confirm"
        disabled={!canConfirm}
        aria-busy={submitting}
        onClick={() => setConfirmSheetOpen(true)}
        className={
          ov ? OverlayUi.btn.primary : `${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.focusRing} disabled:opacity-45`
        }
      >
        {submitting ? t("profile_edit_saving") : confirmLabel}
      </button>
    );

  const changeForm = (
    <div className="space-y-3">
      <div>
        <input
          id="profile-dibay-id"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={raw}
          onChange={(e) => {
            userEditedRef.current = true;
            setRaw(e.target.value);
            setAvailable(null);
            setError(null);
          }}
          onFocus={scrollInputAboveKeyboard}
          placeholder={safeT("profile_edit_dibay_id_placeholder")}
          aria-invalid={showInputError}
          className={`${inputClass} text-[16px] ${showInputError ? inputErrorClass : ""}`}
        />
        <p className={`mt-1 ${cls.helper}`}>
          {publicIdView.canChangeOnce
            ? safeT("profile_edit_dibay_id_change_once_helper")
            : t("profile_edit_dibay_id_helper")}
        </p>
      </div>
      <div className="min-h-[20px]">{statusLine}</div>
      {confirmButton}
      <MobileConfirmBottomSheet
        open={confirmSheetOpen}
        title={t("popup_q_confirm_dibay_id", { id: normalized })}
        description={t("popup_note_dibay_id_final")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("popup_btn_confirm_id")}
        confirmTone="primary"
        onCancel={() => setConfirmSheetOpen(false)}
        onConfirm={() => {
          setConfirmSheetOpen(false);
          void confirm();
        }}
      />
    </div>
  );

  if (!publicIdView.setupComplete && !dibayId?.trim()) {
    return (
      <div className={wrapClass} data-profile-field="dibay_id" data-state="recovery">
        <p className={cls.helper}>
          {safeT("mypage_required_dibay_id_recover_hint")}
        </p>
        {error ? (
          <p className={`mt-2 ${cls.danger}`} role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={recovering}
          onClick={() => void recoverAutoId()}
          className={
            ov
              ? `${OverlayUi.btn.primary} mt-3`
              : `${Sam.btn.primaryCombo} ${Sam.btn.sm} ${Sam.focusRing} mt-3 disabled:opacity-45`
          }
        >
          {recovering
            ? t("profile_edit_saving")
            : safeT("mypage_required_dibay_id_recover_btn")}
        </button>
      </div>
    );
  }

  if (publicIdView.canChangeOnce && publicIdView.atDisplay) {
    return (
      <div
        className={wrapClass}
        data-profile-field="dibay_id"
        data-state={publicIdView.autoAssigned ? "auto-assigned" : "change-available"}
      >
        <p className={`mt-1 ${cls.idText}`}>{publicIdView.atDisplay}</p>
        <p className={`mt-1 ${cls.helper}`}>
          {publicIdView.autoAssigned
            ? safeT("mypage_required_dibay_id_auto_assigned_hint")
            : safeT("mypage_required_dibay_id_change_available_hint")}
        </p>
        {!showChangeForm ? (
          <button
            type="button"
            onClick={() => setShowChangeForm(true)}
            className={
              ov
                ? `mt-3 ${OverlayUi.textAction} underline underline-offset-2`
                : "mt-3 text-[13px] font-semibold text-sam-primary underline underline-offset-2"
            }
          >
            {safeT("mypage_required_dibay_id_change_once_action")}
          </button>
        ) : (
          <div className="mt-4">{changeForm}</div>
        )}
      </div>
    );
  }

  if (publicIdView.setupComplete && publicIdView.atDisplay && !publicIdView.canChangeOnce) {
    return (
      <div className={wrapClass} data-profile-field="dibay_id" data-state="locked">
        <p className={`mt-1 ${cls.idText}`}>{publicIdView.atDisplay}</p>
        <p className={`mt-1 ${cls.helper}`}>
          {publicIdView.changeComplete
            ? safeT("mypage_required_dibay_id_change_complete_hint")
            : t("profile_edit_dibay_id_locked_hint")}
        </p>
      </div>
    );
  }

  return (
    <div className={wrapClass} data-profile-field="dibay_id">
      {changeForm}
    </div>
  );
}
