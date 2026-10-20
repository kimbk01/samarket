"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pickCurrentPublishedLegalDoc, type AppLegalDocumentRow } from "@/lib/legal/app-legal-documents";

export function AdminAppLegalDocumentsPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const [items, setItems] = useState<AppLegalDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState("");

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
          error?: string;
        };
        if (cancelled) return;
        if (json.table_missing) setTableMissing(true);
        if (res.ok && json.ok && Array.isArray(json.documents)) setItems(json.documents);
        else if (!json.table_missing) setLoadError(json.error || `HTTP ${res.status}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Document actually applied to members per kind/locale (same pick as the member reader). */
  const currentIds = new Set(
    (["terms", "privacy"] as const).flatMap((kind) =>
      (["ko", "en"] as const).map(
        (locale) =>
          pickCurrentPublishedLegalDoc(
            items.filter((d) => d.kind === kind && d.locale === locale && d.status === "published"),
          )?.id ?? "",
      ),
    ),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {t("admin_menu_legal")}
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
      ) : loadError ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-red-600">
          {ko ? "목록을 불러오지 못했습니다" : "Could not load documents"}: {loadError}
        </p>
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
                  {d.kind}/{d.locale} · {d.version} ·{" "}
                  {d.status === "published"
                    ? currentIds.has(d.id)
                      ? ko
                        ? "게시 · 현재 적용"
                        : "published · in effect"
                      : ko
                        ? "게시 · 미적용"
                        : "published · not in effect"
                    : ko
                      ? "임시저장"
                      : "draft"}
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
