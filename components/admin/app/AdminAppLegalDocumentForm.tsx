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
  /** terms/privacy once published = a consent record: text and identity are fixed (republish only). */
  const textLocked = Boolean(loaded?.published_at) && isRequiredConsentLegalKind(loaded?.kind);
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
      title: ko ? "약관 임시저장" : "Save legal document draft",
      description: ko ? "임시저장한 문서는 회원에게 노출되지 않습니다." : "Drafts are not visible to members.",
      confirmLabel: safeT("admin_app_legal_save_draft"),
    });
    if (!confirmed.ok) return;
    const json = await send({ ...draftPayload(), status: "draft" });
    if (json) afterSaved(json, ko ? "임시저장했습니다. 회원에게는 노출되지 않습니다." : "Draft saved. Not visible to members.");
  }, [send, draftPayload, afterSaved, ko, safeT]);

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
        ? ko
          ? "선택 동의 문서 — 게시 즉시 가입 화면·내정보 문구가 바뀌고, 이미 동의한 회원에게 다시 묻지 않습니다."
          : "Optional consent — signup and My info text change on publish; members are never re-asked."
        : locale === "ko"
        ? reconsent
          ? ko
            ? `재동의 필요 — 시행 시점부터 모든 회원이 새 약관(${version || "-"})에 다시 동의해야 서비스를 계속 이용할 수 있습니다. 현재 적용 버전: ${currentPublished?.version ?? "없음"}.`
            : `Re-consent required — from the effective time every member must agree to ${version || "-"} to keep using the service. Current: ${currentPublished?.version ?? "none"}.`
          : ko
            ? `공지만 — 기존 동의(${currentPublished?.version ?? "없음"} 등)는 계속 유효하고 회원에게 다시 묻지 않습니다. 새로 동의하는 회원에게 ${version || "-"}이 기록됩니다. 회원 공지는 별도로 해야 합니다.`
            : `Notice only — existing consents (${currentPublished?.version ?? "none"} etc.) stay valid and members are not asked again. New consents record ${version || "-"}. Announce the change separately.`
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
    if (json) afterSaved(json, ko ? "게시했습니다." : "Published.");
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
  ]);

  const publishSameVersionEdit = useCallback(async () => {
    // 같은 버전 본문 수정 = save(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "게시 문서 본문 수정" : "Edit published text",
      description:
        kind === "marketing"
          ? ko
            ? `같은 버전(${loaded?.version ?? ""})으로 혜택·이벤트 동의 문구를 수정합니다. 가입 체크박스·내정보 스위치에 바로 반영되고, 이미 동의·거부한 회원에게 다시 묻지 않습니다. 보내는 내용이 바뀌면 새 버전으로 게시하세요. 수정 전후 본문 해시가 감사 로그에 남습니다.`
            : `Edits the benefits & events consent text under the same version (${loaded?.version ?? ""}). Applied to the signup checkbox and My info switch at once; members are not asked again. Publish a new version if what is sent changes. Before/after body hashes are audit-logged.`
          : ko
            ? `같은 버전(${loaded?.version ?? ""})으로 본문을 수정합니다. 회원 재동의는 발생하지 않으므로 오탈자·표현 정리 등 경미한 수정에만 사용하세요. 법적 내용·필수 동의 항목·개인정보 처리 변경은 새 버전 문서로 게시해야 합니다. 수정 전후 본문 해시가 감사 로그에 남습니다.`
            : `Edits the text under the same version (${loaded?.version ?? ""}). No member re-consent — use only for minor fixes. Material changes must be published as a new version. Before/after body hashes are audit-logged.`,
      confirmLabel: ko ? "수정 게시" : "Publish edit",
    });
    if (!confirmed.ok) return;
    const json = await send({ title, body, confirmNoReconsent: true });
    if (json) afterSaved(json, ko ? "같은 버전으로 본문을 수정했습니다." : "Text updated under the same version.");
  }, [ko, kind, loaded?.version, send, title, body, afterSaved]);

  const unpublish = useCallback(async () => {
    const isCurrent = Boolean(currentPublished && loaded && currentPublished.id === loaded.id);
    // 게시 중단 = exposeStop(L1)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("exposeStop"),
      ko,
      title: ko ? "게시 중단" : "Unpublish",
      description: isCurrent
        ? kind === "marketing"
          ? ko
            ? "현재 가입 화면·내정보에 쓰이는 혜택·이벤트 동의 문구입니다. 게시를 중단하면 이전 게시 문서(없으면 기본 문구)가 쓰입니다. 회원의 동의·거부 기록은 바뀌지 않습니다."
            : "This is the benefits & events consent text in signup and My info. Unpublishing falls back to the previous document (or the built-in text). Members' choices are not changed."
          : ko
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
  }, [currentPublished, loaded, ko, kind, send, afterSaved]);

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
        <span className="font-medium">{ko ? "상태" : "Status"}:</span> {statusLabel}
        {currentPublished ? (
          <span className="ml-2 text-sam-meta">
            {ko ? "현재 적용 버전" : "Current version"} ({kind}/{locale}): {currentPublished.version}
          </span>
        ) : null}
        {loaded?.consent_requirement && isRequiredConsentLegalKind(loaded.kind) ? (
          <span className="ml-2 text-sam-meta" data-admin-legal-consent-requirement={loaded.consent_requirement}>
            {ko ? "개정 유형" : "Revision type"}:{" "}
            {loaded.consent_requirement === "notice"
              ? ko
                ? "공지만"
                : "Notice only"
              : ko
                ? "재동의 필요"
                : "Re-consent required"}
          </span>
        ) : null}
      </div>

      {err ? <p className="text-sm text-sam-danger">{err}</p> : null}
      {notice ? <p className="text-sm text-signature">{notice}</p> : null}

      {identityLocked ? (
        <p className="text-xs text-sam-meta">
          {ko
            ? textLocked
              ? "한 번 게시된 이용약관·개인정보처리방침은 문구를 포함해 바꿀 수 없습니다(회원이 동의한 내용 보존). 개정은 「목록 → 추가」에서 새 버전 문서로 작성해 게시해 주세요."
              : "게시된 문서의 종류·언어·버전·시행일은 바꿀 수 없습니다. 내용이 바뀌는 개정은 「목록 → 추가」에서 새 버전 문서로 작성해 게시해 주세요."
            : textLocked
              ? "Published Terms / Privacy text is fixed (it is what members agreed to). Publish a revision as a new document (List → Add)."
              : "Kind, locale, version and effective time of a published document are fixed. Publish a revision as a new document (List → Add)."}
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
            {ko
              ? "제목 = 가입 동의 화면의 선택 체크박스 이름 · 내정보 「혜택·이벤트 알림」 스위치 이름. 본문 = 「전문 보기」 화면. 선택 동의라 새 버전을 게시해도 회원에게 다시 묻지 않고, 새로 동의하는 회원에게 그 버전이 기록됩니다."
              : "Title = the optional checkbox on the signup consent screen and the My info switch. Body = the full text page. Optional consent: publishing a new version never re-asks members; new consents record that version."}
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
        {kind === "marketing" ? null : <p className="text-xs text-sam-meta">
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
            {ko ? "개정 유형 (게시 전 필수 선택)" : "Revision type (required before publishing)"}
          </legend>
          {(
            [
              {
                value: "reconsent" as const,
                label: ko ? "재동의 필요" : "Re-consent required",
                hint: ko
                  ? "시행 시점부터 모든 회원이 새 버전에 다시 동의해야 서비스를 계속 이용할 수 있습니다. 동의 전에는 글쓰기 등 동의가 필요한 기능이 제한됩니다."
                  : "From the effective time every member must agree again to keep using the service.",
              },
              {
                value: "notice" as const,
                label: ko ? "공지만" : "Notice only",
                hint: ko
                  ? "기존 동의가 계속 유효하고 회원에게 다시 묻지 않습니다. 새로 동의하는 회원에게만 이 버전이 기록됩니다."
                  : "Existing consents stay valid; members are not asked again. New consents record this version.",
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
            {ko
              ? "어떤 변경이 재동의 대상인지는 법적 판단이 필요합니다. 필수 동의 항목·개인정보 수집·이용 목적·제3자 제공이 바뀌면 「재동의 필요」를 기본으로 하세요."
              : "Whether a change needs re-consent is a legal judgment. Default to re-consent when required items, data collection/purpose or third-party sharing change."}
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
            {textLocked ? null : (
              <AdminActionButton
                disabled={saving || (title === loaded?.title && body === loaded?.body)}
                onClick={() => void publishSameVersionEdit()}
                variant="primary"
              >
                {ko ? "본문 수정 게시(재동의 없음)" : "Publish text edit (no re-consent)"}
              </AdminActionButton>
            )}
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
