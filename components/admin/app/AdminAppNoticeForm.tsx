"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";

type NoticeFormState = {
  title: string;
  body: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

export function AdminAppNoticeForm({ noticeId }: { noticeId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(noticeId?.trim());
  const [form, setForm] = useState<NoticeFormState>({
    title: "",
    body: "",
    is_active: true,
    starts_at: "",
    ends_at: "",
  });
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
          notice?: {
            title?: string;
            body?: string;
            is_active?: boolean;
            starts_at?: string | null;
            ends_at?: string | null;
          };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.notice) {
          setErr(typeof json.error === "string" ? json.error : t("admin_app_notices_empty"));
          return;
        }
        setForm({
          title: String(json.notice.title ?? ""),
          body: String(json.notice.body ?? ""),
          is_active: json.notice.is_active !== false,
          starts_at: json.notice.starts_at ? String(json.notice.starts_at).slice(0, 16) : "",
          ends_at: json.notice.ends_at ? String(json.notice.ends_at).slice(0, 16) : "",
        });
      } catch {
        if (!cancelled) setErr(t("admin_app_notices_empty"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, noticeId, t]);

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
      title: form.title,
      body: form.body,
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
          [json.error, json.hint].filter(Boolean).join(" — ") || t("admin_app_notices_empty")
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
      setErr(t("admin_app_notices_empty"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>;
  }

  const campaignHref =
    savedId != null && savedId.trim()
      ? `/admin/notifications/create?${new URLSearchParams({
          type: "notice",
          title: form.title.slice(0, 120),
          body: form.body.slice(0, 500),
          deeplink: buildAppNoticeDetailPath(savedId),
          appNoticeId: savedId,
        }).toString()}`
      : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {isEdit ? t("common_edit") : t("admin_app_add")} — {t("admin_app_notices_title")}
        </h1>
        <Link href="/admin/app/notices" className="sam-text-body text-signature">
          {t("admin_app_notices_title")}
        </Link>
      </div>
      {err ? <p className="sam-text-body text-red-600">{err}</p> : null}
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("notif_admin_notes_subject_ph")}</span>
        <input
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </label>
      <label className="block space-y-1">
        <span className="sam-text-helper text-sam-muted">{t("notif_admin_notes_body_ph")}</span>
        <textarea
          className="min-h-[160px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        <span className="sam-text-body">{t("admin_app_status_visible")}</span>
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
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {t("common_save")}
        </button>
        {campaignHref ? (
          <Link
            href={campaignHref}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body"
          >
            {t("admin_menu_dibay_notification_campaigns")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
