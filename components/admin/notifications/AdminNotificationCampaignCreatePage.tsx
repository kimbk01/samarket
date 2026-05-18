"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminNotificationCampaignCreatePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"notice" | "marketing" | "system">("notice");
  const [targetType, setTargetType] = useState<string>("all");
  const [targetUrl, setTargetUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (mode: "draft" | "send") => {
    setErr(null);
    setBusy(true);
    try {
      const target_user_ids =
        targetType === "selected_users"
          ? selectedIds
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const res = await fetch("/api/admin/notification-campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          type,
          target_type: targetType,
          target_url: targetUrl || null,
          image_url: imageUrl || null,
          segment_region_code: targetType === "region" ? regionCode : null,
          status: "draft",
          target_user_ids,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !j?.ok || !j.id) {
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
        return;
      }
      if (mode === "send") {
        let done = false;
        let guard = 0;
        while (!done && guard < 500) {
          guard += 1;
          const sr = await fetch(`/api/admin/notification-campaigns/${j.id}/send`, {
            method: "POST",
            credentials: "include",
          });
          const sj = (await sr.json().catch(() => ({}))) as { ok?: boolean; done?: boolean };
          if (!sr.ok || !sj?.ok) break;
          done = sj.done === true;
        }
      }
      router.push(`/admin/notifications/${j.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← {t("admin_back_to_list")}
      </Link>
      <h1 className="text-lg font-semibold text-sam-fg">{t("admin_notif_page_create")}</h1>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_type")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          >
            <option value="notice">{t("admin_notif_type_notice")}</option>
            <option value="marketing">{t("admin_notif_type_marketing_opt_in")}</option>
            <option value="system">{t("admin_notif_type_system")}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_target")}</span>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          >
            <option value="all">{t("admin_notif_target_all")}</option>
            <option value="marketing_opt_in">{t("admin_notif_target_marketing_opt_in")}</option>
            <option value="active_users">{t("admin_notif_target_active_users")}</option>
            <option value="region">{t("admin_notif_target_region")}</option>
            <option value="selected_users">{t("admin_notif_target_selected_users")}</option>
            <option value="segment">{t("admin_notif_target_segment")}</option>
          </select>
        </label>

        {targetType === "region" ? (
          <label className="block text-sm">
            <span className="text-sam-muted">{t("admin_notif_label_region_code")}</span>
            <input
              value={regionCode}
              onChange={(e) => setRegionCode(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
            />
          </label>
        ) : null}

        {targetType === "selected_users" ? (
          <label className="block text-sm">
            <span className="text-sam-muted">{t("admin_notif_label_member_uuids")}</span>
            <textarea
              value={selectedIds}
              onChange={(e) => setSelectedIds(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 font-mono text-[12px]"
            />
          </label>
        ) : null}

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_title")}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_body")}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_target_url")}</span>
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_image_url")}</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void submit("draft")}
          className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm disabled:opacity-40"
        >
          {t("admin_notif_btn_draft")}
        </button>
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void submit("send")}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("admin_notif_btn_save_send")}
        </button>
      </div>
    </div>
  );
}
