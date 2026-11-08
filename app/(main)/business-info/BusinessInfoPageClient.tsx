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

  const row = (label: string, value: string) =>
    value ? (
      <div className="border-b border-sam-border-soft py-3">
        <p className="text-xs font-medium text-sam-meta">{label}</p>
        <p className="mt-1 sam-text-body text-sam-fg whitespace-pre-wrap">{value}</p>
      </div>
    ) : null;

  return (
    /** 제목은 1단 헤더(`resolve-main-tier1` `business_info_page_title`)가 첫 프레임부터 표시 — 본문 h1 중복 금지 */
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      {loading ? (
        <p className="text-sam-muted">
          {safeT("common_loading")}
        </p>
      ) : !doc ? (
        <p className="text-sam-muted">
          {safeT("business_info_empty")}
        </p>
      ) : (
        <div>
          {row(
            safeT("admin_app_business_company"),
            doc.companyName,
          )}
          {row(
            safeT("admin_app_business_representative"),
            doc.representativeName,
          )}
          {row(
            safeT("admin_app_business_reg_no"),
            doc.registrationNumber,
          )}
          {row(
            safeT("admin_app_business_mail_order"),
            doc.mailOrderNumber,
          )}
          {row(
            safeT("admin_app_business_address"),
            doc.address,
          )}
          {row(
            safeT("admin_app_business_email"),
            doc.email,
          )}
          {row(
            safeT("admin_app_business_phone"),
            doc.phone,
          )}
        </div>
      )}
    </div>
  );
}
