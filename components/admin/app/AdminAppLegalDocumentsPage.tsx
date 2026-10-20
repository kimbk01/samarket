"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { pickCurrentPublishedLegalDoc, type AppLegalDocumentRow } from "@/lib/legal/app-legal-documents";

export function AdminAppLegalDocumentsPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  /** 쓰기(문서 추가) — 접근표 action perm("settings"). 서버 가드는 그대로. 편집 화면 열기(내용 보기)는 막지 않는다. */
  const action = useAdminRouteAction("/admin/app/legal");
  const [items, setItems] = useState<AppLegalDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadStatus, setLoadStatus] = useState<number | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  /** 조회 실패(네트워크 포함)는 오류 상태 + [새로고침] — 직전 목록은 지우지 않는다 (R7). */
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
        else if (!json.table_missing) {
          setLoadError(json.error || "load_failed");
          setLoadStatus(res.status);
        }
      } catch {
        if (!cancelled) {
          setLoadError("network_error");
          setLoadStatus(undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setLoadError("");
    setLoadStatus(undefined);
    setReloadKey((k) => k + 1);
  };

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
        {action.allowed ? (
          <Link
            href="/admin/app/legal/create"
            className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
          >
            {t("admin_app_add")}
          </Link>
        ) : (
          <AdminActionButton variant="primary" disabled title={action.reason ?? undefined}>
            {t("admin_app_add")}
          </AdminActionButton>
        )}
      </div>
      {!action.allowed && action.reason ? (
        <p className="mb-4 sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `추가 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : loadError ? (
        <AdminErrorState ko={ko} code={loadError} httpStatus={loadStatus} onRetry={reload} />
      ) : tableMissing ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {safeT("admin_app_legal_table_missing", {
            fallbackKo: "app_legal_documents 테이블이 없습니다. 마이그레이션을 적용해 주세요.",
            fallbackEn: "app_legal_documents table is missing. Apply the migration.",
          })}
        </p>
      ) : items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_app_legal_empty", {
            fallbackKo: "등록된 법적 문서가 없습니다.",
            fallbackEn: "No legal documents yet.",
          })}
        />
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
