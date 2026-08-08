"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLegalDocumentRow, AppLegalKind, AppLegalLocale, AppLegalStatus } from "@/lib/legal/app-legal-documents";

type Props = {
  documentId?: string;
};

export function AdminAppLegalDocumentForm({ documentId }: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(documentId));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<AppLegalKind>("terms");
  const [locale, setLocale] = useState<AppLegalLocale>("ko");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<AppLegalStatus>("draft");
  const [effectiveAt, setEffectiveAt] = useState("");

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-legal-documents/${encodeURIComponent(documentId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          document?: AppLegalDocumentRow;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.document) {
          setErr(json.error || t("admin_users_action_failed"));
          return;
        }
        const d = json.document;
        setKind(d.kind);
        setLocale(d.locale);
        setTitle(d.title);
        setBody(d.body);
        setVersion(d.version);
        setStatus(d.status);
        setEffectiveAt(d.effective_at ? d.effective_at.slice(0, 16) : "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, t]);

  const save = useCallback(
    async (nextStatus?: AppLegalStatus) => {
      setSaving(true);
      setErr("");
      try {
        const payload = {
          kind,
          locale,
          title,
          body,
          version,
          status: nextStatus ?? status,
          effective_at: effectiveAt ? new Date(effectiveAt).toISOString() : null,
        };
        const res = await fetch(
          documentId
            ? `/api/admin/app-legal-documents/${encodeURIComponent(documentId)}`
            : "/api/admin/app-legal-documents",
          {
            method: documentId ? "PATCH" : "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          document?: AppLegalDocumentRow;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.document) {
          setErr(json.error || t("admin_users_action_failed"));
          return;
        }
        if (!documentId) {
          router.replace(`/admin/app/legal/${encodeURIComponent(json.document.id)}/edit`);
          return;
        }
        setStatus(json.document.status);
        router.push("/admin/app/legal");
      } finally {
        setSaving(false);
      }
    },
    [kind, locale, title, body, version, status, effectiveAt, documentId, router, t],
  );

  if (loading) {
    return <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {documentId
            ? safeT("admin_app_legal_edit_title", {
                fallbackKo: "법적 문서 수정",
                fallbackEn: "Edit legal document",
              })
            : safeT("admin_app_legal_create_title", {
                fallbackKo: "법적 문서 작성",
                fallbackEn: "Create legal document",
              })}
        </h1>
        <Link href="/admin/app/legal" className="sam-text-body text-signature">
          {safeT("admin_app_legal_back", { fallbackKo: "목록", fallbackEn: "Back" })}
        </Link>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_kind", { fallbackKo: "종류", fallbackEn: "Kind" })}
        </span>
        <select
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={kind}
          onChange={(e) => setKind(e.target.value as AppLegalKind)}
        >
          <option value="terms">terms</option>
          <option value="privacy">privacy</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_locale", { fallbackKo: "언어", fallbackEn: "Locale" })}
        </span>
        <select
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={locale}
          onChange={(e) => setLocale(e.target.value as AppLegalLocale)}
        >
          <option value="ko">ko</option>
          <option value="en">en</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_version", { fallbackKo: "버전", fallbackEn: "Version" })}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
        <p className="text-xs text-sam-meta">
          {safeT("admin_app_legal_version_reconsent_hint", {
            fallbackKo:
              "새 version 문자열로 게시하면 회원 필수 재동의 게이트가 해당 버전으로 바뀝니다. 같은 version으로 본문만 수정하면 재동의는 발생하지 않습니다.",
            fallbackEn:
              "Publishing a new version string updates the required member re-consent gate. Editing the body under the same version does not force re-consent.",
          })}
        </p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_effective_at", {
            fallbackKo: "효력 시작",
            fallbackEn: "Effective at",
          })}
        </span>
        <input
          type="datetime-local"
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={effectiveAt}
          onChange={(e) => setEffectiveAt(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_doc_title", { fallbackKo: "제목", fallbackEn: "Title" })}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_body", {
            fallbackKo: "본문 (문단은 빈 줄로 구분)",
            fallbackEn: "Body (separate paragraphs with a blank line)",
          })}
        </span>
        <textarea
          className="min-h-[280px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save("draft")}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {safeT("admin_app_legal_save_draft", {
            fallbackKo: "임시저장",
            fallbackEn: "Save draft",
          })}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save("published")}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {safeT("admin_app_legal_publish", {
            fallbackKo: "게시",
            fallbackEn: "Publish",
          })}
        </button>
      </div>
    </div>
  );
}
