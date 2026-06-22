"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { normalizeDibayIdInput } from "@/lib/auth/dibay-id-policy";
import {
  evaluatePublicIdProfileView,
  resolvePublicIdInputSeed,
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

type ProfileDibayIdSectionProps = {
  dibayId: string | null;
  dibayIdLocked: boolean;
  username: string | null;
  usernameConfirmed?: boolean | null;
  highlighted?: boolean;
  fieldComplete?: boolean;
  onConfirmed: (confirmedDibayId: string) => void | Promise<void>;
};

export function ProfileDibayIdSection({
  dibayId,
  dibayIdLocked,
  username,
  usernameConfirmed = null,
  highlighted = false,
  fieldComplete = true,
  onConfirmed,
}: ProfileDibayIdSectionProps) {
  const { t, safeT } = useI18n();
  const [raw, setRaw] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const userEditedRef = useRef(false);

  const publicIdView = useMemo(
    () =>
      evaluatePublicIdProfileView({
        dibay_id: dibayId,
        dibay_id_locked: dibayIdLocked,
        username,
        username_confirmed: usernameConfirmed,
      }),
    [dibayId, dibayIdLocked, username, usernameConfirmed]
  );
  const inputSeed = useMemo(
    () =>
      resolvePublicIdInputSeed({
        dibay_id: dibayId,
        dibay_id_locked: dibayIdLocked,
        username,
        username_confirmed: usernameConfirmed,
      }),
    [dibayId, dibayIdLocked, username, usernameConfirmed]
  );

  useEffect(() => {
    if (publicIdView.setupComplete || userEditedRef.current) return;
    setRaw((prev) => (prev.trim().length > 0 ? prev : inputSeed));
  }, [inputSeed, publicIdView.setupComplete]);

  const normalized = useMemo(() => normalizeDibayIdInput(raw), [raw]);

  const reserve = async () => {
    if (!normalized) return;
    setChecking(true);
    setError(null);
    setAvailable(null);
    try {
      const res = await fetch("/api/me/dibay-id/reserve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dibay_id: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ReserveResp | null;
      if (!res.ok || !json || json.ok !== true) {
        setError(t("profile_edit_dibay_id_err_check_failed"));
        return;
      }
      setAvailable(json.available);
      if (!json.available) {
        setError(t("profile_edit_dibay_id_err_duplicate"));
      }
    } catch {
      setError(t("profile_edit_dibay_id_err_check_network"));
    } finally {
      setChecking(false);
    }
  };

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
        } else if (code === "dibay_id_already_locked") {
          setError(t("profile_edit_dibay_id_err_locked"));
        } else {
          setError(t("profile_edit_dibay_id_err_confirm_failed"));
        }
        return;
      }
      userEditedRef.current = false;
      await onConfirmed(json.dibay_id);
    } catch {
      setError(t("profile_edit_dibay_id_err_confirm_network"));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const wrapClass = highlighted
    ? "rounded-ui-rect ring-2 ring-[#00704A]/40 p-3 -m-1"
    : "";

  const inputClass = fieldComplete
    ? OWNER_STORE_PROFILE_CONTROL_CLASS
    : `${OWNER_STORE_PROFILE_CONTROL_CLASS} ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}`;

  if (publicIdView.setupComplete && publicIdView.atDisplay) {
    return (
      <div className={wrapClass} data-profile-field="dibay_id">
        <p className="mt-1 text-[16px] font-semibold text-[#1E3932]">{publicIdView.atDisplay}</p>
        <p className="mt-1 text-[13px] text-[#6F4E37]">{t("profile_edit_dibay_id_locked_hint")}</p>
      </div>
    );
  }

  return (
    <div className={wrapClass} data-profile-field="dibay_id">
      <div className="space-y-3">
        <div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[15px] text-[#6F4E37]">
              @
            </span>
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
              placeholder={safeT("profile_edit_dibay_id_placeholder", {
                fallbackKo: "아이디를 입력해 주세요",
                fallbackEn: "Enter your username",
              })}
              className={`${inputClass} pl-7`}
            />
          </div>
          <p className="mt-1 text-[13px] text-[#6F4E37]">{t("profile_edit_dibay_id_helper")}</p>
        </div>
        {error ? (
          <p className="text-[13px] font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {available === true ? (
          <p className="flex items-center gap-1 text-[13px] font-medium text-[#00704A]">
            <Check className="h-4 w-4" aria-hidden />
            {t("profile_edit_dibay_id_available")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!normalized || checking}
            onClick={() => void reserve()}
            className="rounded-full border border-[#00704A] px-4 py-2 text-[14px] font-semibold text-[#00704A] disabled:opacity-50"
          >
            {checking ? t("profile_edit_dibay_id_checking") : t("profile_edit_dibay_id_check_btn")}
          </button>
          <button
            type="button"
            disabled={!normalized || available !== true || submitting}
            onClick={() => void confirm()}
            className="rounded-full bg-[#00704A] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t("profile_edit_saving") : t("profile_edit_dibay_id_confirm_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}
