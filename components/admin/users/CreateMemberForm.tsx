"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminManualMemberAddressBlock } from "@/components/admin/users/AdminManualMemberAddressBlock";
import { PH_MOBILE_PLUS63_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  adminCreateMemberAddressHasSelection,
  buildAdminCreateMemberContactAddressLine,
  emptyAdminCreateMemberAddress,
  inferTradeLocationFromAdminAddress,
  type AdminCreateMemberAddressInput,
} from "@/lib/admin-users/admin-create-member-address";
import {
  mapAdminCreateMemberApiField,
  validateAdminCreateMemberForm,
  type AdminCreateMemberFieldErrors,
  type AdminCreateMemberFormField,
} from "@/lib/admin-users/admin-create-member-fields";
import { buildManualMemberAuthEmail } from "@/lib/auth/manual-member-email";
import {
  formatPhMobileDisplayPlus63,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import type { MessageKey } from "@/lib/i18n/messages";
import { dibayAlert, DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

const ACCOUNT_TYPE_OPTIONS: {
  value: "development_member" | "operations_member";
  labelKey: MessageKey;
}[] = [
  { value: "development_member", labelKey: "admin_users_account_dev_member" },
  { value: "operations_member", labelKey: "admin_users_account_ops_member" },
];

function fieldClass(hasError: boolean): string {
  return [
    "w-full rounded border px-3 py-2 sam-text-body",
    hasError
      ? "border-sam-danger focus-visible:border-sam-danger focus-visible:ring-sam-danger/25"
      : "border-sam-border focus-visible:border-signature focus-visible:ring-signature/20",
    "focus-visible:outline-none focus-visible:ring-2",
  ].join(" ");
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 sam-text-helper font-medium text-sam-danger" role="alert">
      {message}
    </p>
  );
}

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
  const [address, setAddress] = useState<AdminCreateMemberAddressInput>(emptyAdminCreateMemberAddress());
  const [accountType, setAccountType] = useState<"development_member" | "operations_member">("development_member");
  const [fieldErrors, setFieldErrors] = useState<AdminCreateMemberFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [addressAttempted, setAddressAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdLoginId, setCreatedLoginId] = useState<string | null>(null);
  const [createdLoginEmail, setCreatedLoginEmail] = useState<string | null>(null);

  const clearField = (field: AdminCreateMemberFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (field === "form") setFormError(null);
  };

  const touchField = (field: AdminCreateMemberFormField) => {
    if (field === "addressSearch" || field === "addressDetail") setAddressAttempted(true);
    clearField(field);
  };

  const resolvedFieldMessages = useMemo(() => {
    const out: Partial<Record<AdminCreateMemberFormField, string>> = {};
    for (const [k, v] of Object.entries(fieldErrors) as [AdminCreateMemberFormField, MessageKey][]) {
      if (v) out[k] = t(v);
    }
    return out;
  }, [fieldErrors, t]);

  const resolvedAuthEmailPreview = useMemo(() => {
    const custom = email.trim().toLowerCase();
    const loginId = username.trim().toLowerCase();
    if (!custom) {
      if (loginId.length >= 2) {
        return { kind: "manual" as const, value: buildManualMemberAuthEmail(loginId) };
      }
      return { kind: "need_email" as const, value: null as string | null };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom)) return { kind: "invalid_custom" as const, value: custom };
    return { kind: "explicit" as const, value: custom };
  }, [email, username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const addressTouched =
      addressAttempted ||
      Boolean(address.unitFloorRoom.trim()) ||
      Boolean(address.placeId.trim()) ||
      Boolean(address.formattedAddress.trim());
    if (addressTouched) setAddressAttempted(true);

    const validation = validateAdminCreateMemberForm(
      {
        username,
        password,
        nickname,
        name,
        email,
        contactPhoneDigits,
        accountType,
        address,
      },
      { addressAttempted: addressTouched, phoneRuleKey: "phone_rule" }
    );

    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      const lines = Object.entries(validation).map(([field, key]) => {
        const label =
          field === "username"
            ? t("admin_users_label_username")
            : field === "password"
              ? t("admin_users_label_password")
              : field === "nickname"
                ? t("admin_users_label_nickname")
                : field === "name"
                  ? t("admin_users_label_name")
                  : field === "email"
                    ? t("admin_users_label_email")
                    : field === "contactPhone"
                      ? t("admin_users_label_contact_optional")
                      : field === "addressSearch" || field === "addressDetail"
                        ? t("admin_users_label_address_optional")
                        : field;
        return `· ${label}: ${t(key as MessageKey)}`;
      });
      await dibayAlert({
        title: [t("admin_users_err_create_failed"), ...lines].join("\n"),
      });
      return;
    }
    setFieldErrors({});

    const id = username.trim().toLowerCase();
    let contactPhoneOut: string | undefined;
    if (contactPhoneDigits.trim()) {
      const n = normalizePhMobileDb(contactPhoneDigits);
      if (n) contactPhoneOut = n;
    }

    const inferred = adminCreateMemberAddressHasSelection(address)
      ? inferTradeLocationFromAdminAddress(address)
      : null;
    const regionId = inferred?.regionId ?? "";
    const cityId = inferred?.cityId ?? "";
    const contactAddressOut = adminCreateMemberAddressHasSelection(address)
      ? buildAdminCreateMemberContactAddressLine(address, regionId, cityId)
      : undefined;

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
          regionCode: regionId || undefined,
          cityCode: cityId || undefined,
          addressStreetLine: address.streetAddress.trim() || undefined,
          addressDetail: address.unitFloorRoom.trim() || undefined,
          addressPayload: adminCreateMemberAddressHasSelection(address)
            ? {
                placeId: address.placeId.trim(),
                latitude: address.latitude,
                longitude: address.longitude,
                formattedAddress: address.formattedAddress.trim(),
                roadAddress: address.roadAddress.trim(),
                fullAddress: address.fullAddress.trim(),
                streetAddress: address.streetAddress.trim(),
                unitFloorRoom: address.unitFloorRoom.trim(),
                buildingName: address.buildingName.trim(),
                barangay: address.barangay.trim(),
                cityMunicipality: address.cityMunicipality.trim(),
                province: address.province.trim(),
                neighborhoodName: address.neighborhoodName.trim(),
                deliveryNote: address.deliveryNote.trim(),
                appRegionId: regionId || undefined,
                appCityId: cityId || undefined,
                seedNickname: t("admin_users_addr_seed_nickname"),
              }
            : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        errorKey?: MessageKey;
        field?: string;
        user?: { email?: string };
      };
      if (!res.ok || !data.ok) {
        const mapped = mapAdminCreateMemberApiField(data.field);
        const errKey =
          (data.errorKey as MessageKey | undefined) ??
          (mapped ? mapServerFieldToKey(mapped, res.status, data.error) : undefined);
        let message = data.error?.trim() || "";
        if (res.status === 401) {
          message = t("admin_users_err_login_retry");
        } else if (res.status === 403) {
          message = t("admin_users_err_admin_only_create");
        } else if (errKey) {
          const translated = t(errKey);
          if (translated && translated !== errKey) message = translated;
          else if (!message) message = t("admin_users_err_create_failed");
        } else if (!message) {
          message = t("admin_users_err_create_failed");
        }
        if (mapped) {
          setFieldErrors({ [mapped]: errKey ?? "admin_users_err_create_failed" });
        } else {
          setFieldErrors({ form: "admin_users_err_create_failed" });
        }
        setFormError(message);
        await dibayAlert({ title: message });
        return;
      }
      onSuccess();
      setCreatedLoginId(id);
      const em =
        typeof data.user?.email === "string" && data.user.email.trim()
          ? data.user.email.trim()
          : resolvedAuthEmailPreview.value || email.trim();
      setCreatedLoginEmail(em);
    } catch {
      const msg = t("admin_users_err_request");
      setFormError(msg);
      setFieldErrors({ form: "admin_users_err_request" });
      await dibayAlert({ title: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DibayOverlayRoot open onClose={onClose} dismissible placement="center" zRole="dialog">
      <div
        className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto !p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--overlay-border)] px-5 py-4">
          <h2 className={OverlayUi.title}>{t("admin_users_form_create_member_title")}</h2>
          <p className={`mt-1 ${OverlayUi.caption}`}>{t("admin_users_form_create_member_subtitle")}</p>
        </div>
        {createdLoginId ? (
          <div className="space-y-4 p-5">
            <p className="sam-text-body text-sam-fg">
              {t("admin_users_created_success", { loginId: createdLoginId })}{" "}
              <code className="rounded bg-sam-surface-muted px-1">{createdLoginEmail}</code>
            </p>
            <div className={`${OverlayUi.actionsRow} border-t border-[color:var(--overlay-border)] pt-4`}>
              <Link
                href="/login"
                className="dibay-overlay-btn dibay-overlay-btn--primary"
              >
                {t("admin_users_go_login")}
              </Link>
              <DibayOverlayButton roleTone="secondary" onClick={onClose}>
                {t("common_close")}
              </DibayOverlayButton>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-5" noValidate>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  touchField("username");
                }}
                maxLength={64}
                autoComplete="username"
                aria-invalid={Boolean(resolvedFieldMessages.username)}
                className={fieldClass(Boolean(resolvedFieldMessages.username))}
                placeholder={t("admin_users_ph_username")}
              />
              <FieldError message={resolvedFieldMessages.username} />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  touchField("password");
                }}
                minLength={4}
                maxLength={128}
                autoComplete="new-password"
                aria-invalid={Boolean(resolvedFieldMessages.password)}
                className={fieldClass(Boolean(resolvedFieldMessages.password))}
                placeholder={t("admin_users_ph_password_min")}
              />
              <FieldError message={resolvedFieldMessages.password} />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_nickname")}
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  touchField("nickname");
                }}
                maxLength={20}
                aria-invalid={Boolean(resolvedFieldMessages.nickname)}
                className={fieldClass(Boolean(resolvedFieldMessages.nickname))}
                placeholder={t("admin_users_ph_nickname")}
              />
              <FieldError message={resolvedFieldMessages.nickname} />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  touchField("name");
                }}
                maxLength={50}
                aria-invalid={Boolean(resolvedFieldMessages.name)}
                className={fieldClass(Boolean(resolvedFieldMessages.name))}
                placeholder={t("admin_users_ph_name")}
              />
              <FieldError message={resolvedFieldMessages.name} />
            </div>
            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_email")}{" "}
                <span className="font-normal text-sam-meta">{t("admin_users_optional_paren")}</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  touchField("email");
                }}
                aria-invalid={Boolean(resolvedFieldMessages.email)}
                className={fieldClass(Boolean(resolvedFieldMessages.email))}
                placeholder={t("admin_users_ph_email")}
              />
              <FieldError message={resolvedFieldMessages.email} />
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
                inputMode="tel"
                autoComplete="tel"
                value={formatPhMobileDisplayPlus63(contactPhoneDigits)}
                onChange={(e) => {
                  setContactPhoneDigits(parsePhMobileInput(e.target.value));
                  touchField("contactPhone");
                }}
                aria-invalid={Boolean(resolvedFieldMessages.contactPhone)}
                className={fieldClass(Boolean(resolvedFieldMessages.contactPhone))}
                placeholder={PH_MOBILE_PLUS63_PLACEHOLDER}
              />
              <FieldError message={resolvedFieldMessages.contactPhone} />
            </div>

            <AdminManualMemberAddressBlock
              value={address}
              onChange={setAddress}
              fieldErrors={fieldErrors}
              attempted={addressAttempted}
              onFieldTouch={touchField}
            />

            <div>
              <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                {t("admin_users_label_account_type")}
              </label>
              <select
                value={accountType}
                onChange={(e) => {
                  setAccountType(e.target.value as "development_member" | "operations_member");
                  touchField("accountType");
                }}
                aria-invalid={Boolean(resolvedFieldMessages.accountType)}
                className={fieldClass(Boolean(resolvedFieldMessages.accountType))}
              >
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
              <FieldError message={resolvedFieldMessages.accountType} />
            </div>
            <div className="space-y-2">
              <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50/70 px-3 py-2 sam-text-body-secondary text-sam-fg">
                {t("admin_users_manual_account_hint")}
              </div>
              <p className="sam-text-xxs text-sam-muted">{t("admin_users_admin_via_staff_tab_hint")}</p>
            </div>

            {formError || resolvedFieldMessages.form ? (
              <p className="sam-text-body-secondary text-red-600" role="alert">
                {formError ?? resolvedFieldMessages.form}
              </p>
            ) : null}
            <div className={`${OverlayUi.actionsRow} border-t border-[color:var(--overlay-border)] pt-4`}>
              <DibayOverlayButton roleTone="secondary" type="button" onClick={onClose}>
                {t("common_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton roleTone="primary" type="submit" disabled={submitting} loading={submitting}>
                {submitting ? t("admin_users_creating") : t("admin_users_add")}
              </DibayOverlayButton>
            </div>
          </form>
        )}
      </div>
    </DibayOverlayRoot>
  );
}

function mapServerFieldToKey(
  field: AdminCreateMemberFormField,
  status: number,
  error?: string
): MessageKey {
  if (field === "nickname" && status === 409) return "admin_users_err_nickname_taken";
  if (field === "contactPhone") return "phone_rule";
  if (field === "addressSearch") return "addr_ui_pick_search_result";
  if (field === "addressDetail") return "addr_ui_detail_required_err";
  switch (field) {
    case "username":
      return "admin_users_err_username_length";
    case "password":
      return "admin_users_err_password_min";
    case "nickname":
      return "admin_users_err_nickname_length";
    case "name":
      return "admin_users_err_name_length";
    case "email":
      return "admin_users_err_email_invalid";
    case "accountType":
      return "admin_users_err_account_type_invalid";
    default:
      return "admin_users_err_create_failed";
  }
}
