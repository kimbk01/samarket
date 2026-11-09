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
import { useAdminMe } from "@/hooks/useAdminMe";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";
import {
  APP_NOTICE_AUDIENCE_LABEL_KEY,
  isOwnerAnnouncementAudience,
  parseAppNoticeAudience,
  type AppNoticeAudience,
  type OwnerAnnouncementAudience,
} from "@/lib/notices/app-notice-audience";
import {
  ADMIN_OWNER_NOTICES_PATH,
  adminOwnerNoticeEditPath,
} from "@/lib/notices/admin-owner-notices-model";

/**
 * 공지 폼 종류 (설계 v3.2 §3-4 · Owner 2026-11-10)
 * - `member` = 「앱 공지」(고객센터 · 전체 회원 · audience=all 고정)
 * - `owner`  = 「배달·매장 › 매장 › 매장 공지」(사장님 전용 · 보는 사람 2종 · 고정 · 저장 후 사장님 알림)
 */
export type AdminAppNoticeFormVariant = "member" | "owner";

/** 매장 공지 「보는 사람」 선택지 — 사장님 전체(심사 중 포함) / 승인 매장만 */
const OWNER_NOTICE_AUDIENCE_OPTIONS: readonly OwnerAnnouncementAudience[] = ["store_owners", "store_owners_approved"];

/** DB 시각(UTC ISO) → `datetime-local` 값(브라우저 현지 시각). 저장은 `new Date(값).toISOString()` 으로 되돌린다. */
function isoToDatetimeLocal(iso: unknown): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

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
  /** 보는 사람 — 회원 폼은 all 고정, 매장 공지 폼은 사장님 2종 */
  audience: AppNoticeAudience;
  is_pinned: boolean;
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
  audience: "all",
  is_pinned: false,
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

export function AdminAppNoticeForm({
  noticeId,
  variant = "member",
}: {
  noticeId?: string;
  variant?: AdminAppNoticeFormVariant;
}) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(noticeId?.trim());
  const isOwner = variant === "owner";
  const [form, setForm] = useState<NoticeFormState>(() =>
    isOwner ? { ...EMPTY_FORM, audience: "store_owners" } : EMPTY_FORM
  );
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
  /** 저장 후 사장님 알림 — 매장 공지 폼 · 슈퍼 관리자만 (서버도 슈퍼 관리자만 허용) */
  const { isSuperAdmin } = useAdminMe();
  const [notifyOwners, setNotifyOwners] = useState(false);
  /** 매장 공지 쓰기 = `/admin/stores` 접근표 action(business) — 서버(`/api/admin/app-notices`)도 같은 키 */
  const ownerWriteGuard = useAdminWriteGuard(ADMIN_OWNER_NOTICES_PATH);

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
        // 다른 화면의 글 — 회원 공지는 「앱 공지」, 사장님 공지는 「매장 공지」 수정 화면으로 보낸다
        const loadedOwner = isOwnerAnnouncementAudience(n.audience);
        if (loadedOwner !== isOwner) {
          router.replace(
            loadedOwner
              ? adminOwnerNoticeEditPath(String(noticeId))
              : `/admin/app/notices/${encodeURIComponent(String(noticeId))}/edit`
          );
          return;
        }
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
          starts_at: isoToDatetimeLocal(n.starts_at),
          ends_at: isoToDatetimeLocal(n.ends_at),
          audience: parseAppNoticeAudience(n.audience, "all"),
          is_pinned: n.is_pinned === true,
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
  }, [isEdit, noticeId, reloadKey, isOwner, router]);

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

  const notifyOnSave = isOwner && notifyOwners && isSuperAdmin;

  const onSave = async () => {
    if (isOwner && !ownerWriteGuard.guard()) return;
    // 등록·수정 저장 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: isEdit ? (t("admin_app_save_content")) : t("admin_app_create_content"),
      description:
        notifyOnSave
          ? `${t("admin_app_save_entered_content")}\n${t("admin_app_notice_notify_owners_confirm_desc")}`
          : t("admin_app_save_entered_content"),
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
      // 회원 공지: 새 글 = all 고정, 수정 = 보는 사람을 보내지 않는다(그대로 유지).
      // 매장 공지: 사장님 2종 중 선택 + 고정.
      ...(isOwner
        ? { audience: form.audience, is_pinned: form.is_pinned }
        : isEdit
          ? {}
          : { audience: "all" as const }),
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
      // 매장 공지 — 저장 성공 뒤 사장님 알림(슈퍼 관리자만). 실패해도 저장은 유지하고 결과를 목록에서 보여 준다.
      if (isOwner) {
        if (id && notifyOnSave) {
          const nr = await fetch(`/api/admin/app-notices/${encodeURIComponent(id)}/notify-owners`, {
            method: "POST",
            credentials: "include",
          });
          const nj = (await nr.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            recipients?: number;
            sent?: number;
            failed?: number;
          };
          if (!nr.ok || !nj.ok) {
            // 저장은 끝났다 — 작성 화면에 남으면 다시 저장 시 글이 하나 더 생기므로 목록으로 보내 실패를 보여 준다
            router.push(
              `${ADMIN_OWNER_NOTICES_PATH}?notify_error=${encodeURIComponent(nj.error ?? String(nr.status))}`
            );
            return;
          }
          // 결과는 목록 화면에서 보여 준다(`?notified=대상.성공.실패`)
          router.push(
            `${ADMIN_OWNER_NOTICES_PATH}?notified=${nj.recipients ?? 0}.${nj.sent ?? 0}.${nj.failed ?? 0}`
          );
          return;
        }
        router.push(ADMIN_OWNER_NOTICES_PATH);
        return;
      }
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
    !isOwner && savedId != null && savedId.trim()
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
            } — ${isOwner ? t("admin_menu_store_owner_notices") : safeT("admin_app_notices_title")}`}
          />
        </div>
        {isOwner ? (
          <Link href={ADMIN_OWNER_NOTICES_PATH} className="sam-text-body text-signature">
            {safeT("admin_cc_back_list")}
          </Link>
        ) : (
          <Link
            href={savedId ? `/admin/app/notices/${encodeURIComponent(savedId)}` : "/admin/app/notices"}
            className="sam-text-body text-signature"
          >
            {savedId
              ? safeT("admin_cc_back_detail")
              : safeT("admin_cc_back_list")}
          </Link>
        )}
      </div>

      <p className="sam-text-helper text-sam-muted">
        {isOwner ? t("admin_owner_notices_form_help") : safeT("admin_cc_content_vs_campaign")}
      </p>

      {err ? <p className="sam-text-body text-sam-danger">{err}</p> : null}

      {isOwner ? null : (
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
      )}

      {!isOwner && form.content_type === "update" ? (
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

      {isOwner ? (
        <>
          <label className="block space-y-1" data-admin-notice-audience>
            <span className="sam-text-helper text-sam-muted">{t("admin_app_notice_audience_label")}</span>
            <select
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
              value={form.audience}
              onChange={(e) =>
                setForm((f) => ({ ...f, audience: parseAppNoticeAudience(e.target.value, "store_owners") }))
              }
            >
              {OWNER_NOTICE_AUDIENCE_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(APP_NOTICE_AUDIENCE_LABEL_KEY[a])}
                </option>
              ))}
            </select>
            <span className="block sam-text-helper text-sam-muted">{t("admin_app_notice_audience_owner_hint")}</span>
          </label>

          <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
              />
              <span className="sam-text-body">{t("admin_app_notice_pinned")}</span>
            </label>
            <label className="flex items-center gap-2" data-admin-owner-notice-notify>
              <input
                type="checkbox"
                checked={notifyOwners && isSuperAdmin}
                disabled={!isSuperAdmin}
                onChange={(e) => setNotifyOwners(e.target.checked)}
              />
              <span className="sam-text-body">{t("admin_app_notice_notify_owners")}</span>
            </label>
            <p className="sam-text-helper text-sam-muted">
              {isSuperAdmin
                ? t("admin_app_notice_notify_owners_hint")
                : t("admin_app_notice_notify_owners_super_only")}
            </p>
          </div>
        </>
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

      {isOwner ? null : (
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
      )}

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
          <span className="sam-text-helper text-sam-muted">
            {isOwner ? t("admin_owner_notices_starts_at") : "starts_at"}
          </span>
          <input
            type="datetime-local"
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
            value={form.starts_at}
            onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
          />
        </label>
        <label className="block space-y-1">
          <span className="sam-text-helper text-sam-muted">
            {isOwner ? t("admin_owner_notices_ends_at") : "ends_at"}
          </span>
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
            {isOwner ? t("admin_owner_notices_preview") : safeT("admin_cc_member_preview")}
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
          {isOwner ? t("admin_owner_notices_preview") : safeT("admin_cc_member_preview")}
        </AdminActionButton>
      </div>
    </div>
  );
}
