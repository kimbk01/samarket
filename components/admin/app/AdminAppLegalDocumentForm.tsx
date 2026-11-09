"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  APP_LEGAL_KINDS,
  APP_LEGAL_KIND_LABEL,
  pickCurrentPublishedLegalDoc,
  splitLegalBodyParagraphs,
  type AppLegalDocumentRow,
  type AppLegalKind,
  type AppLegalLocale,
  type AppLegalStatus,
} from "@/lib/legal/app-legal-documents";
import {
  isPublishedTextFixedLegalKind,
  isRequiredConsentLegalKind,
  legalPublishNeedsConsentRequirement,
  type LegalConsentRequirement,
} from "@/lib/legal/app-legal-document-edit-policy";
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
  const [consentRequirement, setConsentRequirement] = useState<LegalConsentRequirement | "">("");

  const isPublished = loaded?.status === "published";
  /** terms/privacy·매장 입점 약관 once published = a signed record: text and identity are fixed (republish only). */
  const textLocked = Boolean(loaded?.published_at) && isPublishedTextFixedLegalKind(loaded?.kind);
  const needsRequirement = !loaded?.published_at && legalPublishNeedsConsentRequirement(kind, locale);

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
      title: t("admin_app_save_legal_document_draft"),
      description: t("admin_app_drafts_are_not_visible_to_members"),
      confirmLabel: safeT("admin_app_legal_save_draft"),
    });
    if (!confirmed.ok) return;
    const json = await send({ ...draftPayload(), status: "draft" });
    if (json) afterSaved(json, t("admin_app_draft_saved_not_visible_to_members"));
  }, [send, draftPayload, afterSaved, ko, safeT, t]);

  const publish = useCallback(async () => {
    const effIso = localInputToIso(effectiveAt);
    const future = effIso ? Date.parse(effIso) > Date.now() : false;
    const reconsent = needsRequirement
      ? consentRequirement === "reconsent"
      : textLocked
        ? loaded?.consent_requirement !== "notice"
        : false;
    const consentLine =
      kind === "marketing"
        ? t("admin_app_optional_consent_signup_and_my_info")
        : kind === "store_partner_terms"
        ? t("admin_app_store_partner_terms_publish_line")
        : locale === "ko"
        ? reconsent
          ? t("admin_app_reconsent_required_line", {
              version: version || "-",
              current: currentPublished?.version ?? t("admin_app_none"),
            })
          : t("admin_app_notice_only_line", {
              version: version || "-",
              current: currentPublished?.version ?? t("admin_app_none"),
            })
        : t("admin_app_english_text_is_display_only_consent");
    // 게시 = save(L1) — 기존 확인 1회 유지.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_app_publish_legal_document"),
      description: [
        `${kind} · ${locale} · ${t("admin_app_version")} ${version || "-"}`,
        future
          ? t("admin_app_current_document_stays_in_effect_until", { adminManilaDateTime: String(formatAdminManilaDateTime(effIso)) })
          : t("admin_app_applies_to_member_app_immediately"),
        consentLine,
      ].join("\n"),
      confirmLabel: t("admin_app_legal_publish"),
    });
    if (!confirmed.ok) return;
    const json = await send(
      textLocked
        ? { status: "published", confirm: true }
        : {
            ...draftPayload(),
            status: "published",
            confirm: true,
            ...(needsRequirement ? { consentRequirement } : {}),
          },
    );
    if (json) afterSaved(json, t("admin_app_published"));
  }, [
    effectiveAt,
    kind,
    locale,
    version,
    currentPublished,
    ko,
    send,
    draftPayload,
    afterSaved,
    needsRequirement,
    consentRequirement,
    textLocked,
    loaded?.consent_requirement,
    t,
  ]);

  const publishSameVersionEdit = useCallback(async () => {
    // 같은 버전 본문 수정 = save(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_app_edit_published_text"),
      description:
        kind === "marketing"
          ? t("admin_app_edits_benefits_events_consent_text_under", { v: String(loaded?.version ?? "") })
          : t("admin_app_edits_text_under_same_version_no", { v: String(loaded?.version ?? "") }),
      confirmLabel: t("admin_app_publish_edit"),
    });
    if (!confirmed.ok) return;
    const json = await send({ title, body, confirmNoReconsent: true });
    if (json) afterSaved(json, t("admin_app_text_updated_under_same_version"));
  }, [ko, kind, loaded?.version, send, title, body, afterSaved, t]);

  const unpublish = useCallback(async () => {
    const isCurrent = Boolean(currentPublished && loaded && currentPublished.id === loaded.id);
    // 게시 중단 = exposeStop(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("exposeStop"),
      ko,
      title: t("admin_app_unpublish"),
      description: isCurrent
        ? kind === "marketing"
          ? t("admin_app_this_is_benefits_events_consent_text")
          : kind === "store_partner_terms"
          ? t("admin_app_store_partner_terms_unpublish_current")
          : t("admin_app_this_is_document_currently_applied_to")
        : t("admin_app_removes_this_document_from_member_surface"),
      confirmLabel: t("admin_app_unpublish"),
      destructive: true,
    });
    if (!confirmed.ok) return;
    const json = await send({ action: "unpublish", confirm: true });
    if (json) afterSaved(json, t("admin_app_unpublished"));
  }, [currentPublished, loaded, ko, kind, send, afterSaved, t]);

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

  const identityLocked = isPublished || textLocked;
  const statusLabel = loaded
    ? loaded.status === "published"
      ? currentPublished?.id === loaded.id
        ? t("admin_app_published_in_effect")
        : t("admin_app_published_not_in_effect")
      : t("admin_app_draft_not_visible_to_members")
    : t("admin_app_new_document");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 [&>[data-admin-page-header]]:mb-0">
          <AdminPageHeader
            title={
              documentId
                ? safeT("admin_app_legal_edit_title")
                : safeT("admin_app_legal_create_title")
            }
          />
        </div>
        <Link href="/admin/app/legal" className="sam-text-body text-signature">
          {safeT("admin_app_legal_back")}
        </Link>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg">
        <span className="font-medium">{t("admin_app_status")}:</span> {statusLabel}
        {currentPublished ? (
          <span className="ml-2 text-sam-meta">
            {t("admin_app_current_version")} ({kind}/{locale}): {currentPublished.version}
          </span>
        ) : null}
        {loaded?.consent_requirement && isRequiredConsentLegalKind(loaded.kind) ? (
          <span className="ml-2 text-sam-meta" data-admin-legal-consent-requirement={loaded.consent_requirement}>
            {t("admin_app_revision_type")}:{" "}
            {loaded.consent_requirement === "notice"
              ? t("admin_app_notice_only")
              : t("admin_app_re_consent_required")}
          </span>
        ) : null}
      </div>

      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
      {notice ? <p className="text-sm text-signature">{notice}</p> : null}

      {identityLocked ? (
        <p className="text-xs text-sam-meta">
          {t(textLocked ? "admin_legal_doc_text_locked_note" : "admin_legal_doc_identity_locked_note")}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_kind")}
        </span>
        <select
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={kind}
          disabled={identityLocked}
          onChange={(e) => setKind(e.target.value as AppLegalKind)}
        >
          {APP_LEGAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {ko ? APP_LEGAL_KIND_LABEL[k].ko : APP_LEGAL_KIND_LABEL[k].en}
            </option>
          ))}
        </select>
        {kind === "marketing" ? (
          <p className="text-xs text-sam-meta" data-admin-legal-marketing-hint>
            {t("admin_app_title_optional_checkbox_on_signup_consent")}
          </p>
        ) : kind === "store_partner_terms" ? (
          <p className="text-xs text-sam-meta" data-admin-legal-store-partner-hint>
            {t("admin_app_store_partner_terms_hint")}
          </p>
        ) : null}
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_locale")}
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
          {safeT("admin_app_legal_version")}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={version}
          disabled={identityLocked}
          onChange={(e) => setVersion(e.target.value)}
        />
        {kind === "marketing" ? null : kind === "store_partner_terms" ? (
          <p className="text-xs text-sam-meta">{t("admin_app_store_partner_terms_version_hint")}</p>
        ) : <p className="text-xs text-sam-meta">
          {safeT("admin_app_legal_version_reconsent_hint")}
        </p>}
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_effective_at")}
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
          {safeT("admin_app_legal_doc_title")}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 disabled:opacity-60"
          value={title}
          disabled={textLocked}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-sam-muted">
          {safeT("admin_app_legal_body")}
        </span>
        <textarea
          className="min-h-[280px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono text-sm disabled:opacity-60"
          value={body}
          disabled={textLocked}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      {needsRequirement && !isPublished ? (
        <fieldset className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3" data-admin-legal-consent-requirement-choice>
          <legend className="px-1 text-xs font-medium text-sam-muted">
            {t("admin_app_revision_type_required_before_publishing")}
          </legend>
          {(
            [
              {
                value: "reconsent" as const,
                label: t("admin_app_re_consent_required"),
                hint: t("admin_app_from_effective_time_every_member_must"),
              },
              {
                value: "notice" as const,
                label: t("admin_app_notice_only"),
                hint: t("admin_app_existing_consents_stay_valid_members_are"),
              },
            ]
          ).map((opt) => (
            <label key={opt.value} className="flex min-h-[44px] items-start gap-2">
              <input
                type="radio"
                name="legal-consent-requirement"
                value={opt.value}
                checked={consentRequirement === opt.value}
                onChange={() => setConsentRequirement(opt.value)}
                className="mt-1"
              />
              <span className="text-sm text-sam-fg">
                <span className="font-medium">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-sam-meta">{opt.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-sam-meta">
            {t("admin_app_whether_change_needs_re_consent_is")}
          </p>
        </fieldset>
      ) : null}

      <div>
        <AdminActionButton
          onClick={() => setShowPreview((v) => !v)}
          variant="ghost"
          size="sm"
          className="px-0"
        >
          {showPreview ? (t("admin_app_hide_preview")) : t("admin_app_member_preview")}
        </AdminActionButton>
        {showPreview ? (
          <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app px-4 py-4">
            <h2 className="text-xl font-semibold text-sam-fg">{title || "-"}</h2>
            <p className="mt-1 text-xs text-sam-meta">
              {t("admin_app_legal_version")} {version || "-"}
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
            {textLocked ? null : (
              <AdminActionButton
                disabled={saving || (title === loaded?.title && body === loaded?.body)}
                onClick={() => void publishSameVersionEdit()}
                variant="primary"
              >
                {t("admin_app_publish_text_edit_no_re_consent")}
              </AdminActionButton>
            )}
            <AdminActionButton
              disabled={saving}
              onClick={() => void unpublish()}
              variant="secondary"
            >
              {t("admin_app_unpublish")}
            </AdminActionButton>
          </>
        ) : (
          <>
            {textLocked ? null : (
            <AdminActionButton
              disabled={saving}
              onClick={() => void saveDraft()}
              variant="secondary"
            >
              {safeT("admin_app_legal_save_draft")}
            </AdminActionButton>
            )}
            <AdminActionButton
              disabled={
                saving ||
                !title.trim() ||
                !body.trim() ||
                !version.trim() ||
                (needsRequirement && !consentRequirement)
              }
              onClick={() => void publish()}
              variant="primary"
            >
              {safeT("admin_app_legal_publish")}
            </AdminActionButton>
          </>
        )}
      </div>
    </div>
  );
}
