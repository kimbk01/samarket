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
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

type Props = { documentId?: string };

export function AdminAppBusinessInfoForm({ documentId }: Props) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(documentId));
  const [saving, setSaving] = useState(false);
  /** G-18: 사업자 정보 저장·게시(POST·PATCH) = settings 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/app/business");
  const [err, setErr] = useState("");
  /** 수정 화면 원본 불러오기 실패 — 표준 오류 상태 + [새로고침] (저장 오류와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
          setLoadErr({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
          return;
        }
        setLoadErr(null);
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
      } catch {
        if (!cancelled) setLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, reloadKey]);

  const save = useCallback(
    async (nextStatus?: AppBusinessStatus) => {
      // 등록·수정 저장(임시저장·게시) = L1 확인 (표준 확인창)
      const publishing = (nextStatus ?? status) === "published";
      const label = publishing
        ? safeT("admin_app_legal_publish")
        : safeT("admin_app_legal_save_draft");
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko,
        title: ko ? `사업자 정보 ${label}` : `Business information · ${label}`,
        description: publishing
          ? ko
            ? "입력한 내용을 게시 상태로 저장합니다."
            : "Save the entered content as published."
          : ko
            ? "입력한 내용을 임시저장합니다."
            : "Save the entered content as a draft.",
        confirmLabel: label,
      });
      if (!confirmed.ok) return;
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
      safeT,
      ko,
    ],
  );

  if (loading) return <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />;
  if (loadErr) {
    return (
      <AdminErrorState
        ko={ko}
        code={loadErr.code}
        httpStatus={loadErr.httpStatus}
        onRetry={() => {
          setLoading(true);
          setLoadErr(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 [&>[data-admin-page-header]]:mb-0">
          <AdminPageHeader
            title={
              documentId
                ? safeT("admin_app_business_edit_title")
                : safeT("admin_app_business_create_title")
            }
          />
        </div>
        <Link href="/admin/app/business" className="sam-text-body text-signature">
          {safeT("admin_app_legal_back")}
        </Link>
      </div>
      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_locale")}
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
        safeT("admin_app_business_company"),
        companyName,
        setCompanyName,
      )}
      {field(
        safeT("admin_app_business_representative"),
        representativeName,
        setRepresentativeName,
      )}
      {field(
        safeT("admin_app_business_reg_no"),
        registrationNumber,
        setRegistrationNumber,
      )}
      {field(
        safeT("admin_app_business_mail_order"),
        mailOrderNumber,
        setMailOrderNumber,
      )}
      {field(
        safeT("admin_app_business_address"),
        address,
        setAddress,
        true,
      )}
      {field(safeT("admin_app_business_email"), email, setEmail)}
      {field(safeT("admin_app_business_phone"), phone, setPhone)}
      {field(
        safeT("admin_app_legal_version"),
        version,
        setVersion,
      )}

      {!adminAction.allowed && adminAction.reason ? (
        <p className="sam-text-body-secondary text-sam-muted" data-admin-action-denied="1">
          {adminAction.reason}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AdminActionButton
          disabled={saving || !adminAction.allowed}
          title={adminAction.reason ?? undefined}
          onClick={() => void save("draft")}
          variant="secondary"
        >
          {safeT("admin_app_legal_save_draft")}
        </AdminActionButton>
        <AdminActionButton
          disabled={saving || !adminAction.allowed}
          title={adminAction.reason ?? undefined}
          onClick={() => void save("published")}
          variant="primary"
        >
          {safeT("admin_app_legal_publish")}
        </AdminActionButton>
      </div>
    </div>
  );
}
