"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  AppBusinessLocale,
  AppBusinessStatus,
  AppPlatformBusinessInfoRow,
} from "@/lib/business/app-platform-business-info";

type Props = { documentId?: string };

export function AdminAppBusinessInfoForm({ documentId }: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(documentId));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [locale, setLocale] = useState<AppBusinessLocale>("ko");
  const [companyName, setCompanyName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [mailOrderNumber, setMailOrderNumber] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [version, setVersion] = useState("1");
  const [status, setStatus] = useState<AppBusinessStatus>("draft");

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-business-info/${encodeURIComponent(documentId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          document?: AppPlatformBusinessInfoRow;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.document) {
          setErr(json.error || t("admin_users_action_failed"));
          return;
        }
        const d = json.document;
        setLocale(d.locale);
        setCompanyName(d.companyName);
        setRepresentativeName(d.representativeName);
        setRegistrationNumber(d.registrationNumber);
        setMailOrderNumber(d.mailOrderNumber);
        setAddress(d.address);
        setEmail(d.email);
        setPhone(d.phone);
        setVersion(d.version);
        setStatus(d.status);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, t]);

  const save = useCallback(
    async (nextStatus?: AppBusinessStatus) => {
      setSaving(true);
      setErr("");
      try {
        const payload = {
          locale,
          companyName,
          representativeName,
          registrationNumber,
          mailOrderNumber,
          address,
          email,
          phone,
          version,
          status: nextStatus ?? status,
        };
        const res = await fetch(
          documentId
            ? `/api/admin/app-business-info/${encodeURIComponent(documentId)}`
            : "/api/admin/app-business-info",
          {
            method: documentId ? "PATCH" : "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          document?: AppPlatformBusinessInfoRow;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.document) {
          setErr(json.error || t("admin_users_action_failed"));
          return;
        }
        if (!documentId) {
          router.replace(`/admin/app/business/${encodeURIComponent(json.document.id)}/edit`);
          return;
        }
        router.push("/admin/app/business");
      } finally {
        setSaving(false);
      }
    },
    [
      locale,
      companyName,
      representativeName,
      registrationNumber,
      mailOrderNumber,
      address,
      email,
      phone,
      version,
      status,
      documentId,
      router,
      t,
    ],
  );

  if (loading) return <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>;

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    multiline = false,
  ) => (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-sam-muted">{label}</span>
      {multiline ? (
        <textarea
          className="min-h-[80px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {documentId
            ? safeT("admin_app_business_edit_title", {
                fallbackKo: "사업자 정보 수정",
                fallbackEn: "Edit business information",
              })
            : safeT("admin_app_business_create_title", {
                fallbackKo: "사업자 정보 작성",
                fallbackEn: "Create business information",
              })}
        </h1>
        <Link href="/admin/app/business" className="sam-text-body text-signature">
          {safeT("admin_app_legal_back", { fallbackKo: "목록", fallbackEn: "Back" })}
        </Link>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_locale", { fallbackKo: "언어", fallbackEn: "Locale" })}
        </span>
        <select
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={locale}
          onChange={(e) => setLocale(e.target.value as AppBusinessLocale)}
        >
          <option value="ko">ko</option>
          <option value="en">en</option>
        </select>
      </label>

      {field(
        safeT("admin_app_business_company", { fallbackKo: "상호", fallbackEn: "Company name" }),
        companyName,
        setCompanyName,
      )}
      {field(
        safeT("admin_app_business_representative", {
          fallbackKo: "대표자",
          fallbackEn: "Representative",
        }),
        representativeName,
        setRepresentativeName,
      )}
      {field(
        safeT("admin_app_business_reg_no", {
          fallbackKo: "사업자등록번호",
          fallbackEn: "Business registration number",
        }),
        registrationNumber,
        setRegistrationNumber,
      )}
      {field(
        safeT("admin_app_business_mail_order", {
          fallbackKo: "통신판매업 신고번호",
          fallbackEn: "Mail-order registration number",
        }),
        mailOrderNumber,
        setMailOrderNumber,
      )}
      {field(
        safeT("admin_app_business_address", { fallbackKo: "주소", fallbackEn: "Address" }),
        address,
        setAddress,
        true,
      )}
      {field(safeT("admin_app_business_email", { fallbackKo: "이메일", fallbackEn: "Email" }), email, setEmail)}
      {field(safeT("admin_app_business_phone", { fallbackKo: "전화", fallbackEn: "Phone" }), phone, setPhone)}
      {field(
        safeT("admin_app_legal_version", { fallbackKo: "버전", fallbackEn: "Version" }),
        version,
        setVersion,
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save("draft")}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {safeT("admin_app_legal_save_draft", { fallbackKo: "임시저장", fallbackEn: "Save draft" })}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save("published")}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {safeT("admin_app_legal_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </button>
      </div>
    </div>
  );
}
