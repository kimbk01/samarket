"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppPlatformBusinessInfoRow } from "@/lib/business/app-platform-business-info";

export function BusinessInfoPageClient() {
  const { language, safeT } = useI18n();
  const locale = language === "en" ? "en" : "ko";
  const [doc, setDoc] = useState<AppPlatformBusinessInfoRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/business-info?locale=${locale}&_ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          document?: AppPlatformBusinessInfoRow | null;
        };
        if (!cancelled && res.ok && json.ok && json.document) setDoc(json.document);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const title = safeT("business_info_page_title", {
    fallbackKo: "사업자 정보",
    fallbackEn: "Business information",
  });

  const row = (label: string, value: string) =>
    value ? (
      <div className="border-b border-sam-border-soft py-3">
        <p className="text-xs font-medium text-sam-meta">{label}</p>
        <p className="mt-1 sam-text-body text-sam-fg whitespace-pre-wrap">{value}</p>
      </div>
    ) : null;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-sam-fg">{title}</h1>
      {loading ? (
        <p className="mt-4 text-sam-muted">
          {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : !doc ? (
        <p className="mt-4 text-sam-muted">
          {safeT("business_info_empty", {
            fallbackKo: "등록된 사업자 정보가 없습니다.",
            fallbackEn: "Business information is not available yet.",
          })}
        </p>
      ) : (
        <div className="mt-4">
          {row(
            safeT("admin_app_business_company", { fallbackKo: "상호", fallbackEn: "Company name" }),
            doc.companyName,
          )}
          {row(
            safeT("admin_app_business_representative", {
              fallbackKo: "대표자",
              fallbackEn: "Representative",
            }),
            doc.representativeName,
          )}
          {row(
            safeT("admin_app_business_reg_no", {
              fallbackKo: "사업자등록번호",
              fallbackEn: "Business registration number",
            }),
            doc.registrationNumber,
          )}
          {row(
            safeT("admin_app_business_mail_order", {
              fallbackKo: "통신판매업 신고번호",
              fallbackEn: "Mail-order registration number",
            }),
            doc.mailOrderNumber,
          )}
          {row(
            safeT("admin_app_business_address", { fallbackKo: "주소", fallbackEn: "Address" }),
            doc.address,
          )}
          {row(
            safeT("admin_app_business_email", { fallbackKo: "이메일", fallbackEn: "Email" }),
            doc.email,
          )}
          {row(
            safeT("admin_app_business_phone", { fallbackKo: "전화", fallbackEn: "Phone" }),
            doc.phone,
          )}
        </div>
      )}
    </div>
  );
}
