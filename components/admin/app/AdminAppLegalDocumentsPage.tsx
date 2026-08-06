"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLegalDocumentRow } from "@/lib/legal/app-legal-documents";

export function AdminAppLegalDocumentsPage() {
  const { t, safeT } = useI18n();
  const [items, setItems] = useState<AppLegalDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/app-legal-documents", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          documents?: AppLegalDocumentRow[];
          table_missing?: boolean;
        };
        if (cancelled) return;
        if (json.table_missing) setTableMissing(true);
        if (res.ok && json.ok && Array.isArray(json.documents)) setItems(json.documents);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {safeT("admin_app_legal_title", {
            fallbackKo: "약관·개인정보",
            fallbackEn: "Terms & privacy",
          })}
        </h1>
        <Link
          href="/admin/app/legal/create"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_app_add")}
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : tableMissing ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {safeT("admin_app_legal_table_missing", {
            fallbackKo: "app_legal_documents 테이블이 없습니다. 마이그레이션을 적용해 주세요.",
            fallbackEn: "app_legal_documents table is missing. Apply the migration.",
          })}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {safeT("admin_app_legal_empty", {
            fallbackKo: "등록된 법적 문서가 없습니다.",
            fallbackEn: "No legal documents yet.",
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3"
            >
              <div>
                <span className="font-medium">{d.title}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {d.kind}/{d.locale} · {d.version} · {d.status}
                </span>
              </div>
              <Link href={`/admin/app/legal/${d.id}/edit`} className="sam-text-body text-signature">
                {t("common_edit")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
