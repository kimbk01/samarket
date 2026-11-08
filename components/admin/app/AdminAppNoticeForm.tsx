"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdminCustomerCenterMarkdownToolbar } from "@/components/admin/app/AdminCustomerCenterMarkdownToolbar";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import {
  BOARD_LABEL,
  CUSTOMER_CENTER_CONTENT_TYPES,
  DEFAULT_AUTHOR_LABEL,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

type NoticeFormState = {
  content_type: CustomerCenterContentType;
  title: string;
  body: string;
  hero_image_url: string;
  /** S7 — 업데이트 소식 글의 앱 버전 */
  app_version: string;
  author_label: string;
  comment_enabled: boolean;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

const EMPTY_FORM: NoticeFormState = {
  content_type: "notice",
  title: "",
  body: "",
  hero_image_url: "",
  app_version: "",
  author_label: "",
  comment_enabled: true,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

async function uploadContentImage(kind: "hero" | "body", file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/admin/app-notices/upload-image", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string };
  return res.ok && j.ok && j.url ? j.url : null;
}

export function AdminAppNoticeForm({ noticeId }: { noticeId?: string }) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(noticeId?.trim());
  const [form, setForm] = useState<NoticeFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 수정 화면 원본 불러오기 실패 — 표준 오류 상태 + [새로고침] (저장 오류와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const ko = language !== "en";
  const [savedId, setSavedId] = useState<string | null>(noticeId?.trim() || null);
  const [showPreview, setShowPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit || !noticeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(noticeId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notice?: Record<string, unknown>;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.notice) {
          setLoadErr({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
          return;
        }
        setLoadErr(null);
        const n = json.notice;
        const ct = (CUSTOMER_CENTER_CONTENT_TYPES as readonly string[]).includes(String(n.content_type))
          ? (String(n.content_type) as CustomerCenterContentType)
          : "notice";
        setForm({
          content_type: ct,
          title: String(n.title ?? ""),
          body: String(n.body ?? ""),
          hero_image_url: n.hero_image_url ? String(n.hero_image_url) : "",
          app_version: n.app_version ? String(n.app_version) : "",
          author_label: n.author_label ? String(n.author_label) : "",
          comment_enabled: n.comment_enabled !== false,
          is_active: n.is_active !== false,
          starts_at: n.starts_at ? String(n.starts_at).slice(0, 16) : "",
          ends_at: n.ends_at ? String(n.ends_at).slice(0, 16) : "",
        });
      } catch {
        if (!cancelled) setLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, noticeId, reloadKey]);

  const toIsoOrNull = (local: string): string | null => {
    const v = local.trim();
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const onHeroUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadContentImage("hero", file);
      if (!url) {
        setErr(
          safeT("admin_cc_upload_failed")
        );
        return;
      }
      setForm((f) => ({ ...f, hero_image_url: url }));
    } finally {
      setBusy(false);
      if (heroFileRef.current) heroFileRef.current.value = "";
    }
  };

  const onSave = async () => {
    // 등록·수정 저장 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: isEdit ? (t("admin_app_save_content")) : t("admin_app_create_content"),
      description: t("admin_app_save_entered_content"),
      confirmLabel: adminCta(isEdit ? "save" : "create", ko),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setErr(null);
    const payload = {
      content_type: form.content_type,
      title: form.title,
      body: form.body,
      hero_image_url: form.hero_image_url.trim() || null,
      app_version: form.content_type === "update" ? form.app_version.trim() || null : null,
      author_label: form.author_label.trim() || null,
      comment_enabled: form.comment_enabled,
      is_active: form.is_active,
      starts_at: toIsoOrNull(form.starts_at),
      ends_at: toIsoOrNull(form.ends_at),
    };
    try {
      const res = await fetch(
        isEdit && noticeId
          ? `/api/admin/app-notices/${encodeURIComponent(noticeId)}`
          : "/api/admin/app-notices",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notice?: { id?: string };
        error?: string;
        hint?: string;
      };
      if (!res.ok || !json.ok) {
        setErr(
          [json.error, json.hint].filter(Boolean).join(" — ") ||
            safeT("admin_app_notices_empty")
        );
        return;
      }
      const id = String(json.notice?.id ?? noticeId ?? "").trim();
      setSavedId(id || null);
      if (id) {
        router.push(`/admin/app/notices/${encodeURIComponent(id)}`);
        return;
      }
      router.push("/admin/app/notices");
    } catch {
      setErr(
        safeT("admin_app_notices_empty")
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminLoadingState
        ko={ko}
        label={safeT("admin_dashboard_loading")}
      />
    );
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

  const boardLabel = BOARD_LABEL[form.content_type][language === "en" ? "en" : "ko"];
  const defaultAuthor = DEFAULT_AUTHOR_LABEL[form.content_type][language === "en" ? "en" : "ko"];
  const authorDisplay = form.author_label.trim() || defaultAuthor;
  const canonical =
    savedId != null && savedId.trim()
      ? buildCustomerCenterBoardDetailPath(form.content_type, savedId)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 [&>[data-admin-page-header]]:mb-0">
          <AdminPageHeader
            title={`${
              isEdit
                ? safeT("common_edit")
                : safeT("admin_app_add")
            } — ${safeT("admin_app_notices_title")}`}
          />
        </div>
        <Link
          href={savedId ? `/admin/app/notices/${encodeURIComponent(savedId)}` : "/admin/app/notices"}
          className="sam-text-body text-signature"
        >
          {savedId
            ? safeT("admin_cc_back_detail")
            : safeT("admin_cc_back_list")}
        </Link>
      </div>

      <p className="sam-text-helper text-sam-muted">
        {safeT("admin_cc_content_vs_campaign")}
      </p>

      {err ? <p className="sam-text-body text-sam-danger">{err}</p> : null}

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_board")}
        </span>
        <select
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.content_type}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              content_type: e.target.value as CustomerCenterContentType,
            }))
          }
        >
          {/* 앱 업데이트 v2 (D-V0): 업데이트 내역은 스토어에서 자동 — 새 「업데이트」 글은 만들지 않는다 */}
          {CUSTOMER_CENTER_CONTENT_TYPES.filter((type) => type !== "update" || form.content_type === "update").map((type) => (
            <option key={type} value={type}>
              {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
            </option>
          ))}
        </select>
      </label>

      {form.content_type === "update" ? (
        <label className="block space-y-1" data-admin-cc-app-version>
          <span className="sam-text-helper text-sam-muted">
            {safeT("admin_cc_app_version")}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
            value={form.app_version}
            maxLength={32}
            onChange={(e) => setForm((f) => ({ ...f, app_version: e.target.value }))}
          />
          <span className="sam-text-helper text-sam-muted">
            {safeT("admin_cc_app_version_hint")}
          </span>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_board_title")}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </label>

      <div className="space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_board_body")}
        </span>
        <AdminCustomerCenterMarkdownToolbar
          value={form.body}
          textareaRef={bodyRef}
          disabled={busy}
          onUploadingChange={setBusy}
          onChange={(next) => setForm((f) => ({ ...f, body: next }))}
        />
        <textarea
          ref={bodyRef}
          className="min-h-[240px] w-full rounded-b-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono text-sm"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
        <p className="text-xs text-sam-meta">
          {safeT("admin_cc_md_hint")}
        </p>
      </div>

      <div className="space-y-2">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_hero_image")}
        </span>
        <input
          ref={heroFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-xs"
          disabled={busy}
          onChange={(e) => void onHeroUpload(e.target.files?.[0] ?? null)}
        />
        {form.hero_image_url ? (
          <div className="space-y-2">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
              <SamarketThumbnail
                src={form.hero_image_url}
                alt=""
                fill
                fetchDisplayPx={640}
                className="h-full w-full"
                imageClassName="object-cover"
                roundedClassName="rounded-ui-rect"
              />
            </div>
            <AdminActionButton
              variant="quiet"
              size="sm"
              onClick={() => setForm((f) => ({ ...f, hero_image_url: "" }))}
            >
              {safeT("admin_cc_hero_clear")}
            </AdminActionButton>
          </div>
        ) : null}
      </div>

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_author_label")}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.author_label}
          onChange={(e) => setForm((f) => ({ ...f, author_label: e.target.value }))}
          placeholder={defaultAuthor}
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.comment_enabled}
          onChange={(e) => setForm((f) => ({ ...f, comment_enabled: e.target.checked }))}
        />
        <span className="sam-text-body">
          {safeT("admin_cc_comments_on")}
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        <span className="sam-text-body">
          {safeT("admin_app_status_visible")}
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">starts_at</span>
          <input
            type="datetime-local"
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
            value={form.starts_at}
            onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
          />
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">ends_at</span>
          <input
            type="datetime-local"
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
            value={form.ends_at}
            onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
          />
        </label>
      </div>

      {canonical ? (
        <p className="text-xs text-sam-meta">
          {boardLabel}: {canonical}
        </p>
      ) : null}

      {showPreview ? (
        <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <p className="text-xs font-semibold text-sam-fg">
            {safeT("admin_cc_member_preview")}
          </p>
          <article className="space-y-3">
            <header className="space-y-1">
              <h2 className="text-xl font-semibold break-words text-sam-fg">{form.title || "—"}</h2>
              <p className="text-xs text-sam-meta">{authorDisplay}</p>
            </header>
            {form.hero_image_url ? (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
                <SamarketThumbnail
                  src={form.hero_image_url}
                  alt=""
                  fill
                  fetchDisplayPx={640}
                  className="h-full w-full"
                  imageClassName="object-cover"
                  roundedClassName="rounded-ui-rect"
                />
              </div>
            ) : null}
            <CustomerCenterSafeMarkdownBody body={form.body || ""} />
          </article>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <AdminActionButton
          disabled={busy}
          onClick={() => void onSave()}
          variant="primary"
        >
          {isEdit
            ? safeT("common_save")
            : safeT("common_save")}
        </AdminActionButton>
        <AdminActionButton
          disabled={busy}
          onClick={() => setShowPreview((v) => !v)}
          variant="secondary"
        >
          {safeT("admin_cc_member_preview")}
        </AdminActionButton>
      </div>
    </div>
  );
}
