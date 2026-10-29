"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  pickCurrentPublishedLegalDoc,
  splitLegalBodyParagraphs,
  type AppLegalDocumentRow,
  type AppLegalKind,
  type AppLegalLocale,
  type AppLegalStatus,
} from "@/lib/legal/app-legal-documents";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

type Props = {
  documentId?: string;
};

/** ISO (UTC) → `datetime-local` value in the admin's local time (B18: no UTC-as-local drift). */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

type SaveResponse = {
  ok?: boolean;
  document?: AppLegalDocumentRow;
  error?: string;
  message?: string;
};

export function AdminAppLegalDocumentForm({ documentId }: Props) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(documentId));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  /** 수정 화면 원본 불러오기 실패 — 표준 오류 상태 + [새로고침] (저장 오류와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<AppLegalKind>("terms");
  const [locale, setLocale] = useState<AppLegalLocale>("ko");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [version, setVersion] = useState("");
  const [loaded, setLoaded] = useState<AppLegalDocumentRow | null>(null);
  const [effectiveAt, setEffectiveAt] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [allDocs, setAllDocs] = useState<AppLegalDocumentRow[]>([]);

  const isPublished = loaded?.status === "published";

  const loadAll = useCallback(async () => {
    const res = await fetch("/api/admin/app-legal-documents", { credentials: "include", cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; documents?: AppLegalDocumentRow[] };
    if (res.ok && json.ok) setAllDocs(json.documents ?? []);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-legal-documents/${encodeURIComponent(documentId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as SaveResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.document) {
          setLoadErr({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
          return;
        }
        setLoadErr(null);
        const d = json.document;
        setLoaded(d);
        setKind(d.kind);
        setLocale(d.locale);
        setTitle(d.title);
        setBody(d.body);
        setVersion(d.version);
        setEffectiveAt(isoToLocalInput(d.effective_at));
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

  /** Version members currently consent against for this kind/locale (published + effective now). */
  const currentPublished = useMemo(() => {
    const rows = allDocs.filter((d) => d.kind === kind && d.locale === locale && d.status === "published");
    return pickCurrentPublishedLegalDoc(rows);
  }, [allDocs, kind, locale]);

  const send = useCallback(
    async (payload: Record<string, unknown>): Promise<SaveResponse | null> => {
      setSaving(true);
      setErr("");
      setNotice("");
      try {
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
        const json = (await res.json().catch(() => ({}))) as SaveResponse;
        if (!res.ok || !json.ok || !json.document) {
          setErr(json.message || json.error || t("admin_users_action_failed"));
          return null;
        }
        return json;
      } catch {
        setErr(t("admin_users_action_failed"));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [documentId, t],
  );

  const afterSaved = useCallback(
    (json: SaveResponse, message: string) => {
      if (!json.document) return;
      if (!documentId) {
        router.replace(`/admin/app/legal/${encodeURIComponent(json.document.id)}/edit`);
        return;
      }
      const d = json.document;
      setLoaded(d);
      setEffectiveAt(isoToLocalInput(d.effective_at));
      setNotice(message);
      void loadAll();
    },
    [documentId, router, loadAll],
  );

  const draftPayload = useCallback(
    () => ({ kind, locale, title, body, version, effective_at: localInputToIso(effectiveAt) }),
    [kind, locale, title, body, version, effectiveAt],
  );

  const saveDraft = useCallback(async () => {
    // 임시저장 = save(L1) 확인
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "약관 임시저장" : "Save legal document draft",
      description: ko ? "임시저장한 문서는 회원에게 노출되지 않습니다." : "Drafts are not visible to members.",
      confirmLabel: safeT("admin_app_legal_save_draft", { fallbackKo: "임시저장", fallbackEn: "Save draft" }),
    });
    if (!confirmed.ok) return;
    const json = await send({ ...draftPayload(), status: "draft" });
    if (json) afterSaved(json, ko ? "임시저장했습니다. 회원에게는 노출되지 않습니다." : "Draft saved. Not visible to members.");
  }, [send, draftPayload, afterSaved, ko, safeT]);

  const publish = useCallback(async () => {
    const effIso = localInputToIso(effectiveAt);
    const future = effIso ? Date.parse(effIso) > Date.now() : false;
    const reconsent =
      kind === "terms" || kind === "privacy"
        ? !currentPublished || currentPublished.version.trim() !== version.trim()
        : false;
    const consentLine =
      locale === "ko"
        ? reconsent
          ? ko
            ? `버전이 현재 적용 버전(${currentPublished?.version ?? "없음"})과 달라, 시행 시점부터 모든 회원이 새 약관에 다시 동의해야 합니다.`
            : `Version differs from the current one (${currentPublished?.version ?? "none"}): every member must re-consent once it takes effect.`
          : ko
            ? "현재 적용 버전과 같아 회원 재동의는 발생하지 않습니다."
            : "Same as the current version: no member re-consent."
        : ko
          ? "영문 문서는 표시용이며, 동의 기준 버전은 한국어(ko) 문서를 따릅니다."
          : "English text is display-only; the consent version follows the Korean (ko) document.";
    // 게시 = save(L1) — 기존 확인 1회 유지.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "약관 게시" : "Publish legal document",
      description: [
        `${kind} · ${locale} · ${ko ? "버전" : "version"} ${version || "-"}`,
        future
          ? ko
            ? `시행일(${formatAdminManilaDateTime(effIso)} PHT) 전까지는 기존 문서가 계속 적용됩니다.`
            : `The current document stays in effect until ${formatAdminManilaDateTime(effIso)} PHT.`
          : ko
            ? "게시 즉시 회원 앱에 적용됩니다."
            : "Applies to the member app immediately.",
        consentLine,
      ].join("\n"),
      confirmLabel: ko ? "게시" : "Publish",
    });
    if (!confirmed.ok) return;
    const json = await send({ ...draftPayload(), status: "published", confirm: true });
    if (json) afterSaved(json, ko ? "게시했습니다." : "Published.");
  }, [effectiveAt, kind, locale, version, currentPublished, ko, send, draftPayload, afterSaved]);

  const publishSameVersionEdit = useCallback(async () => {
    // 같은 버전 본문 수정 = save(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "게시 문서 본문 수정" : "Edit published text",
      description: ko
        ? `같은 버전(${loaded?.version ?? ""})으로 본문을 수정합니다. 회원 재동의는 발생하지 않으므로 오탈자·표현 정리 등 경미한 수정에만 사용하세요. 법적 내용·필수 동의 항목·개인정보 처리 변경은 새 버전 문서로 게시해야 합니다. 수정 전후 본문 해시가 감사 로그에 남습니다.`
        : `Edits the text under the same version (${loaded?.version ?? ""}). No member re-consent — use only for minor fixes. Material changes must be published as a new version. Before/after body hashes are audit-logged.`,
      confirmLabel: ko ? "수정 게시" : "Publish edit",
    });
    if (!confirmed.ok) return;
    const json = await send({ title, body, confirmNoReconsent: true });
    if (json) afterSaved(json, ko ? "같은 버전으로 본문을 수정했습니다." : "Text updated under the same version.");
  }, [ko, loaded?.version, send, title, body, afterSaved]);

  const unpublish = useCallback(async () => {
    const isCurrent = Boolean(currentPublished && loaded && currentPublished.id === loaded.id);
    // 게시 중단 = exposeStop(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("exposeStop"),
      ko,
      title: ko ? "게시 중단" : "Unpublish",
      description: isCurrent
        ? ko
          ? "현재 회원에게 적용 중인 문서입니다. 게시를 중단하면 이전 게시 문서(없으면 기본 문구)가 적용되고, 동의 기준 버전이 바뀔 수 있습니다."
          : "This is the document currently applied to members. Unpublishing falls back to the previous published document (or the built-in text) and may change the consent version."
        : ko
          ? "이 문서를 회원 화면에서 내립니다."
          : "Removes this document from the member surface.",
      confirmLabel: ko ? "게시 중단" : "Unpublish",
      destructive: true,
    });
    if (!confirmed.ok) return;
    const json = await send({ action: "unpublish", confirm: true });
    if (json) afterSaved(json, ko ? "게시를 중단했습니다." : "Unpublished.");
  }, [currentPublished, loaded, ko, send, afterSaved]);

  if (loading) {
    return <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />;
  }
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

  const identityLocked = isPublished;
  const statusLabel = loaded
    ? loaded.status === "published"
      ? currentPublished?.id === loaded.id
        ? ko
          ? "게시 · 현재 적용 중"
          : "Published · in effect"
        : ko
          ? "게시 · 미적용(시행 전 또는 다른 게시본 적용 중)"
          : "Published · not in effect"
      : ko
        ? "임시저장(회원 미노출)"
        : "Draft (not visible to members)"
    : ko
      ? "새 문서"
      : "New document";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 [&>[data-admin-page-header]]:mb-0">
          <AdminPageHeader
            title={
              documentId
                ? safeT("admin_app_legal_edit_title", {
                    fallbackKo: "법적 문서 수정",
                    fallbackEn: "Edit legal document",
                  })
                : safeT("admin_app_legal_create_title", {
                    fallbackKo: "법적 문서 작성",
                    fallbackEn: "Create legal document",
                  })
            }
          />
        </div>
        <Link href="/admin/app/legal" className="sam-text-body text-signature">
          {safeT("admin_app_legal_back", { fallbackKo: "목록", fallbackEn: "Back" })}
        </Link>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg">
        <span className="font-medium">{ko ? "상태" : "Status"}:</span> {statusLabel}
        {currentPublished ? (
          <span className="ml-2 text-sam-meta">
            {ko ? "현재 적용 버전" : "Current version"} ({kind}/{locale}): {currentPublished.version}
          </span>
        ) : null}
      </div>

      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
      {notice ? <p className="text-sm text-signature">{notice}</p> : null}

      {identityLocked ? (
        <p className="text-xs text-sam-meta">
          {ko
            ? "게시된 문서의 종류·언어·버전·시행일은 바꿀 수 없습니다. 내용이 바뀌는 개정은 「목록 → 추가」에서 새 버전 문서로 작성해 게시해 주세요."
            : "Kind, locale, version and effective time of a published document are fixed. Publish a revision as a new document (List → Add)."}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_kind", { fallbackKo: "종류", fallbackEn: "Kind" })}
        </span>
        <select
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={kind}
          disabled={identityLocked}
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
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={locale}
          disabled={identityLocked}
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
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={version}
          disabled={identityLocked}
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
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={effectiveAt}
          disabled={identityLocked}
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

      <div>
        <AdminActionButton
          onClick={() => setShowPreview((v) => !v)}
          variant="ghost"
          size="sm"
          className="px-0"
        >
          {showPreview ? (ko ? "미리보기 닫기" : "Hide preview") : ko ? "회원 화면 미리보기" : "Member preview"}
        </AdminActionButton>
        {showPreview ? (
          <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app px-4 py-4">
            <h2 className="text-xl font-semibold text-sam-fg">{title || "-"}</h2>
            <p className="mt-1 text-xs text-sam-meta">
              {ko ? "버전" : "Version"} {version || "-"}
            </p>
            <div className="mt-3 space-y-3 sam-text-body leading-relaxed text-sam-fg">
              {splitLegalBodyParagraphs(body).map((p, i) => (
                <p key={`${i}-${p.slice(0, 24)}`}>{p}</p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {isPublished ? (
          <>
            <AdminActionButton
              disabled={saving || (title === loaded?.title && body === loaded?.body)}
              onClick={() => void publishSameVersionEdit()}
              variant="primary"
            >
              {ko ? "본문 수정 게시(재동의 없음)" : "Publish text edit (no re-consent)"}
            </AdminActionButton>
            <AdminActionButton
              disabled={saving}
              onClick={() => void unpublish()}
              variant="secondary"
            >
              {ko ? "게시 중단" : "Unpublish"}
            </AdminActionButton>
          </>
        ) : (
          <>
            <AdminActionButton
              disabled={saving}
              onClick={() => void saveDraft()}
              variant="secondary"
            >
              {safeT("admin_app_legal_save_draft", {
                fallbackKo: "임시저장",
                fallbackEn: "Save draft",
              })}
            </AdminActionButton>
            <AdminActionButton
              disabled={saving || !title.trim() || !body.trim() || !version.trim()}
              onClick={() => void publish()}
              variant="primary"
            >
              {safeT("admin_app_legal_publish", {
                fallbackKo: "게시",
                fallbackEn: "Publish",
              })}
            </AdminActionButton>
          </>
        )}
      </div>
    </div>
  );
}
