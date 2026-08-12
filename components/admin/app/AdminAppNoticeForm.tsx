"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOARD_LABEL,
  CUSTOMER_CENTER_CONTENT_TYPES,
  DEFAULT_AUTHOR_LABEL,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";

type NoticeFormState = {
  content_type: CustomerCenterContentType;
  title: string;
  body: string;
  hero_image_url: string;
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
  author_label: "",
  comment_enabled: true,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

export function AdminAppNoticeForm({ noticeId }: { noticeId?: string }) {
  const { safeT, language } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(noticeId?.trim());
  const [form, setForm] = useState<NoticeFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(noticeId?.trim() || null);

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
          setErr(
            typeof json.error === "string"
              ? json.error
              : safeT("admin_app_notices_empty", {
                  fallbackKo: "공지를 불러오지 못했습니다",
                  fallbackEn: "Could not load content",
                })
          );
          return;
        }
        const n = json.notice;
        const ct = (CUSTOMER_CENTER_CONTENT_TYPES as readonly string[]).includes(
          String(n.content_type)
        )
          ? (String(n.content_type) as CustomerCenterContentType)
          : "notice";
        setForm({
          content_type: ct,
          title: String(n.title ?? ""),
          body: String(n.body ?? ""),
          hero_image_url: n.hero_image_url ? String(n.hero_image_url) : "",
          author_label: n.author_label ? String(n.author_label) : "",
          comment_enabled: n.comment_enabled !== false,
          is_active: n.is_active !== false,
          starts_at: n.starts_at ? String(n.starts_at).slice(0, 16) : "",
          ends_at: n.ends_at ? String(n.ends_at).slice(0, 16) : "",
        });
      } catch {
        if (!cancelled) {
          setErr(
            safeT("admin_app_notices_empty", {
              fallbackKo: "공지를 불러오지 못했습니다",
              fallbackEn: "Could not load content",
            })
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, noticeId, safeT]);

  const toIsoOrNull = (local: string): string | null => {
    const v = local.trim();
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const onSave = async () => {
    setBusy(true);
    setErr(null);
    const payload = {
      content_type: form.content_type,
      title: form.title,
      body: form.body,
      hero_image_url: form.hero_image_url.trim() || null,
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
            safeT("admin_app_notices_empty", {
              fallbackKo: "저장에 실패했습니다",
              fallbackEn: "Save failed",
            })
        );
        return;
      }
      const id = String(json.notice?.id ?? noticeId ?? "").trim();
      setSavedId(id || null);
      if (!isEdit && id) {
        router.replace(`/admin/app/notices/${encodeURIComponent(id)}/edit`);
        return;
      }
      router.push("/admin/app/notices");
    } catch {
      setErr(
        safeT("admin_app_notices_empty", {
          fallbackKo: "저장에 실패했습니다",
          fallbackEn: "Save failed",
        })
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sam-muted">
        {safeT("admin_dashboard_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }

  const boardLabel = BOARD_LABEL[form.content_type][language === "en" ? "en" : "ko"];
  const defaultAuthor = DEFAULT_AUTHOR_LABEL[form.content_type][language === "en" ? "en" : "ko"];
  const canonical =
    savedId != null && savedId.trim()
      ? buildCustomerCenterBoardDetailPath(form.content_type, savedId)
      : null;

  /** COPY CONTRACT: never pass Board body as Campaign body. */
  const campaignHref =
    savedId != null && savedId.trim() && canonical
      ? `/admin/notifications/create?${new URLSearchParams({
          type: form.content_type,
          deeplink: canonical,
          appNoticeId: savedId,
        }).toString()}`
      : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {isEdit
            ? safeT("common_edit", { fallbackKo: "수정", fallbackEn: "Edit" })
            : safeT("admin_app_add", { fallbackKo: "추가", fallbackEn: "Add" })}{" "}
          —{" "}
          {safeT("admin_app_notices_title", {
            fallbackKo: "고객센터 콘텐츠",
            fallbackEn: "Customer Center content",
          })}
        </h1>
        <Link href="/admin/app/notices" className="sam-text-body text-signature">
          {safeT("admin_app_notices_title", {
            fallbackKo: "목록",
            fallbackEn: "List",
          })}
        </Link>
      </div>

      <p className="rounded-ui-rect border border-sam-border bg-sam-muted/10 px-3 py-2 text-xs text-sam-muted">
        {safeT("admin_cc_content_vs_campaign", {
          fallbackKo:
            "여기 제목·본문은 게시판 원본입니다. 알림 문구는 [알림 발송]에서 따로 작성합니다(자동 축약 없음).",
          fallbackEn:
            "Title/body here are the board original. Write short notification copy separately via Send notification (no auto-truncate).",
        })}
      </p>

      {err ? <p className="sam-text-body text-red-600">{err}</p> : null}

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_board", { fallbackKo: "보드", fallbackEn: "Board" })}
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
          {CUSTOMER_CENTER_CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_board_title", { fallbackKo: "원본 제목", fallbackEn: "Board title" })}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </label>

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_board_body", { fallbackKo: "원본 본문", fallbackEn: "Board body" })}
        </span>
        <textarea
          className="min-h-[200px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
      </label>

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_hero_image", {
            fallbackKo: "대표 이미지 URL",
            fallbackEn: "Hero image URL",
          })}
        </span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.hero_image_url}
          onChange={(e) => setForm((f) => ({ ...f, hero_image_url: e.target.value }))}
          placeholder="https://"
        />
      </label>

      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">
          {safeT("admin_cc_author_label", {
            fallbackKo: `작성자 표시 (기본: ${defaultAuthor})`,
            fallbackEn: `Author label (default: ${defaultAuthor})`,
          })}
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
          {safeT("admin_cc_comments_on", { fallbackKo: "댓글 허용", fallbackEn: "Comments on" })}
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        <span className="sam-text-body">
          {safeT("admin_app_status_visible", { fallbackKo: "게시", fallbackEn: "Published" })}
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {safeT("common_save", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </button>
        {campaignHref ? (
          <Link
            href={campaignHref}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium"
          >
            {safeT("admin_cc_send_notification", {
              fallbackKo: "알림 발송",
              fallbackEn: "Send notification",
            })}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
