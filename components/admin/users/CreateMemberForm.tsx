"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
import { StoreAddressStreetDetailGrid } from "@/components/stores/StoreAddressStreetDetailGrid";
import { STORE_LOCATION_SECTION_HINT_ADMIN_CREATE_MEMBER } from "@/lib/stores/store-address-form-ui";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { getLocationLabelIfValid } from "@/lib/products/form-options";
import {
  formatPhMobileDisplay,
  normalizePhMobileDb,
  parsePhMobileInput,
  PH_LOCAL_MOBILE_RULE_MESSAGE_KO,
} from "@/lib/utils/ph-mobile";
import type { MessageKey } from "@/lib/i18n/messages";

const ACCOUNT_TYPE_OPTIONS: {
  value: "development_member" | "operations_member" | "admin";
  labelKey: MessageKey;
}[] = [
  { value: "development_member", labelKey: "admin_users_account_dev_member" },
  { value: "operations_member", labelKey: "admin_users_account_ops_member" },
  { value: "admin", labelKey: "admin_users_account_admin" },
];

interface CreateMemberFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateMemberForm({ onClose, onSuccess }: CreateMemberFormProps) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactPhoneDigits, setContactPhoneDigits] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [addressStreetLine, setAddressStreetLine] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [accountType, setAccountType] = useState<"development_member" | "operations_member" | "admin">("development_member");
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [createdLoginId, setCreatedLoginId] = useState<string | null>(null);
  const [createdLoginEmail, setCreatedLoginEmail] = useState<string | null>(null);

  const resolvedAuthEmailPreview = useMemo(() => {
    const custom = email.trim().toLowerCase();
    if (!custom) return { kind: "need_email" as const, value: null as string | null };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom)) return { kind: "invalid_custom" as const, value: custom };
    return { kind: "explicit" as const, value: custom };
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLocationError(undefined);

    const id = username.trim().toLowerCase();
    if (!id || id.length < 2 || id.length > 64) {
      setError(t("admin_users_err_username_length"));
      return;
    }
    if (!password || password.length < 4) {
      setError(t("admin_users_err_password_min"));
      return;
    }
    if (!nickname.trim() || nickname.trim().length > 20) {
      setError(t("admin_users_err_nickname_length"));
      return;
    }
    if (!name.trim() || name.trim().length > 50) {
      setError(t("admin_users_err_name_length"));
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("admin_users_err_email_invalid"));
      return;
    }

    if (region && !city) {
      setLocationError(t("admin_users_err_location_city"));
      return;
    }

    let contactPhoneOut: string | undefined;
    if (contactPhoneDigits.trim()) {
      const n = normalizePhMobileDb(contactPhoneDigits);
      if (!n) {
        setError(PH_LOCAL_MOBILE_RULE_MESSAGE_KO);
        return;
      }
      contactPhoneOut = n;
    }

    const locationLabel = getLocationLabelIfValid(region, city);
    const lines: string[] = [];
    if (locationLabel) lines.push(locationLabel);
    const sub = [addressStreetLine.trim(), addressDetail.trim()].filter(Boolean).join(" · ");
    if (sub) lines.push(sub);
    const contactAddressOut = lines.length > 0 ? lines.join("\n") : undefined;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: id,
          password,
          nickname: nickname.trim(),
          name: name.trim(),
          email: email.trim(),
          accountType,
          contactPhone: contactPhoneOut,
          contactAddress: contactAddressOut,
          regionCode: region.trim() || undefined,
          cityCode: city.trim() || undefined,
          addressStreetLine: addressStreetLine.trim() || undefined,
          addressDetail: addressDetail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError(t("admin_users_err_login_retry"));
          return;
        }
        if (res.status === 403) {
          setError(t("admin_users_err_admin_only_create"));
          return;
        }
        setError(data.error || t("admin_users_err_create_failed"));
        return;
      }
      if (data.ok) {
        onSuccess();
        setCreatedLoginId(id);
        const em =
          typeof data.user?.email === "string" && data.user.email.trim()
            ? data.user.email.trim()
            : email.trim();
        setCreatedLoginEmail(em);
      } else {
        setError(data.error || t("admin_users_err_create_failed"));
      }
    } catch {
      setError(t("admin_users_err_request"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect bg-sam-surface shadow-xl">
        <div className="border-b border-sam-border px-5 py-4">
          <h2 className="text-lg font-semibold text-sam-fg">{t("admin_users_form_create_member_title")}</h2>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_users_form_create_member_subtitle")}</p>
        </div>
        {createdLoginId ? (
          <div className="space-y-4 p-5">
            <p className="sam-text-body text-sam-fg">
              {t("admin_users_created_success", { loginId: createdLoginId })}{" "}
              <code className="rounded bg-sam-surface-muted px-1">{createdLoginEmail}</code>
            </p>
            <div className="flex flex-wrap gap-2 border-t border-sam-border pt-4">
              <Link
                href="/login"
                className="rounded bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90"
              >
                {t("admin_users_go_login")}
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-sam-border px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
              >
                {t("common_close")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_username")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={64}
                autoComplete="username"
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_username")}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                maxLength={128}
                autoComplete="new-password"
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_password_min")}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_nickname")}</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_nickname")}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={t("admin_users_ph_name")}
              />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder="reviewer@samarket.app"
              />
            </div>
            <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/60 px-3 py-2">
              <p className="sam-text-xxs text-sam-muted">{t("admin_users_label_auth_email")}</p>
              <code className="mt-0.5 block break-all sam-text-body-secondary text-sam-fg">
                {resolvedAuthEmailPreview.kind === "need_email"
                  ? "—"
                  : resolvedAuthEmailPreview.kind === "invalid_custom"
                    ? t("admin_users_auth_email_invalid")
                    : resolvedAuthEmailPreview.value}
              </code>
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_contact_optional")}{" "}
                <span className="font-normal text-sam-meta">{t("admin_users_optional_paren")}</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formatPhMobileDisplay(contactPhoneDigits)}
                onChange={(e) => setContactPhoneDigits(parsePhMobileInput(e.target.value))}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                placeholder={PH_LOCAL_09_PLACEHOLDER}
              />
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
              <LocationSelector
                embedded
                showRequired={false}
                region={region}
                city={city}
                onRegionChange={(id) => {
                  setRegion(id);
                  setCity("");
                  setLocationError(undefined);
                }}
                onCityChange={(id) => {
                  setCity(id);
                  setLocationError(undefined);
                }}
                error={locationError}
                label={t("admin_users_label_trade_region")}
                showZipLookup={false}
              />
              <p className="mt-2 sam-text-helper leading-relaxed text-sam-muted">
                {STORE_LOCATION_SECTION_HINT_ADMIN_CREATE_MEMBER}
              </p>
              <div className="mt-2">
                <StoreAddressStreetDetailGrid
                  addressStreetLine={addressStreetLine}
                  addressDetail={addressDetail}
                  onAddressStreetLineChange={setAddressStreetLine}
                  onAddressDetailChange={setAddressDetail}
                  inputClassName="w-full rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_account_type")}</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as "development_member" | "operations_member" | "admin")}
                className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
              >
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50/70 px-3 py-2 sam-text-body-secondary text-sam-fg">
              {t("admin_users_manual_account_hint")}
            </div>

            {error && <p className="sam-text-body-secondary text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-sam-border pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-sam-border px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
              >
                {t("common_cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-signature px-4 py-2 sam-text-body text-white hover:bg-signature/90 disabled:opacity-50"
              >
                {submitting ? t("admin_users_creating") : t("admin_users_add")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
