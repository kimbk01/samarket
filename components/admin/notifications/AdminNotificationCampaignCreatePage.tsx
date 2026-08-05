"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";

type Channel = "push_only" | "in_app_only" | "push_and_in_app" | "test_only";

async function uploadCampaignImage(kind: "push" | "in_app", file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/admin/notification-campaigns/upload-image", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string };
  return res.ok && j.ok && j.url ? j.url : null;
}

function newClientIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AdminNotificationCampaignCreatePage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"notice" | "marketing" | "system">("notice");
  const [channel, setChannel] = useState<Channel>("push_and_in_app");
  const [targetType, setTargetType] = useState<string>("all");
  const [deeplinkUrl, setDeeplinkUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [pushImageUrl, setPushImageUrl] = useState("");
  const [inAppImageUrl, setInAppImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [testUserIds, setTestUserIds] = useState("");
  const [appNoticeId, setAppNoticeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<"none" | "normal" | "all">("none");
  const [audience, setAudience] = useState<CampaignAudiencePreview | null>(null);

  useEffect(() => {
    const qType = searchParams.get("type");
    if (qType === "notice" || qType === "marketing" || qType === "system") setType(qType);
    const qTitle = searchParams.get("title");
    if (qTitle) setTitle(qTitle);
    const qBody = searchParams.get("body");
    if (qBody) setBody(qBody);
    const qDeeplink = searchParams.get("deeplink");
    if (qDeeplink) setDeeplinkUrl(qDeeplink);
    const qNotice = searchParams.get("appNoticeId");
    if (qNotice) setAppNoticeId(qNotice);
  }, [searchParams]);

  const presentation = useMemo(
    () =>
      buildAdminCampaignNotificationPresentation({
        title: title.trim() || "DIBAY",
        body: body.trim() || "-",
        type,
        channel,
        deeplink_url: deeplinkUrl || null,
        web_url: webUrl || null,
        push_image_url: pushImageUrl || null,
        in_app_image_url: inAppImageUrl || null,
        target_type: targetType,
        appNoticeId: appNoticeId || null,
      }),
    [title, body, type, channel, deeplinkUrl, webUrl, pushImageUrl, inAppImageUrl, targetType, appNoticeId]
  );

  const loadAudiencePreview = async () => {
    const target_user_ids =
      targetType === "selected_users"
        ? selectedIds
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const res = await fetch("/api/admin/notification-campaigns/audience-preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        channel,
        target_type: targetType,
        segment_region_code: targetType === "region" ? regionCode : null,
        target_user_ids,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      audience?: CampaignAudiencePreview;
      message?: string;
      error?: string;
    };
    if (!res.ok || !j.ok || !j.audience) {
      setErr(
        typeof j.message === "string"
          ? j.message
          : j.error === "segment_unsupported"
            ? t("admin_notif_err_segment_unsupported")
            : t("admin_notif_err_save")
      );
      return null;
    }
    setAudience(j.audience);
    return j.audience;
  };

  const runBatchSend = async (campaignId: string) => {
    const idempotencyKey = newClientIdempotencyKey();
    const sr = await fetch(`/api/admin/notification-campaigns/${campaignId}/send`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ idempotency_key: idempotencyKey }),
    });
    const sj = (await sr.json().catch(() => ({}))) as { ok?: boolean; done?: boolean; error?: string };
    if (!sr.ok || !sj?.ok) {
      setErr(typeof sj?.error === "string" ? sj.error : t("admin_notif_err_save"));
    }
  };

  const submit = async (mode: "draft" | "send" | "schedule") => {
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
          channel,
          target_type: targetType,
          deeplink_url: deeplinkUrl || null,
          web_url: webUrl || null,
          push_image_url: pushImageUrl || null,
          in_app_image_url: inAppImageUrl || null,
          segment_region_code: targetType === "region" ? regionCode : null,
          scheduled_at:
            mode === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: mode === "schedule" ? "scheduled" : "draft",
          target_user_ids,
          app_notice_id: appNoticeId.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j?.ok || !j.id) {
        setErr(
          typeof j.message === "string"
            ? j.message
            : j.error === "segment_unsupported"
              ? t("admin_notif_err_segment_unsupported")
              : typeof j?.error === "string"
                ? j.error
                : t("admin_notif_err_save")
        );
        return;
      }
      if (mode === "send") {
        await runBatchSend(j.id);
      }
      router.push(`/admin/notifications/${j.id}`);
    } finally {
      setBusy(false);
      setConfirmSend("none");
    }
  };

  const openConfirm = async () => {
    setErr(null);
    setBusy(true);
    try {
      const preview = await loadAudiencePreview();
      if (!preview) return;
      setConfirmSend(targetType === "all" ? "all" : "normal");
    } finally {
      setBusy(false);
    }
  };

  const runTestSend = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notification-campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          type,
          channel: "test_only",
          target_type: "selected_users",
          deeplink_url: deeplinkUrl || null,
          web_url: webUrl || null,
          push_image_url: pushImageUrl || null,
          in_app_image_url: inAppImageUrl || null,
          target_user_ids: testUserIds
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !j?.ok || !j.id) {
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
        return;
      }
      const userIds = testUserIds
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const testKey = newClientIdempotencyKey();
      const tr = await fetch(`/api/admin/notification-campaigns/${j.id}/test-send`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": testKey,
        },
        body: JSON.stringify({ user_ids: userIds, idempotency_key: testKey }),
      });
      const tj = (await tr.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!tr.ok || !tj?.ok) {
        setErr(typeof tj?.error === "string" ? tj.error : t("admin_notif_err_save"));
        return;
      }
      router.push(`/admin/notifications/${j.id}`);
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (kind: "push" | "in_app", file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadCampaignImage(kind, file);
      if (!url) {
        setErr(t("admin_notif_err_save"));
        return;
      }
      if (kind === "push") setPushImageUrl(url);
      else setInAppImageUrl(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
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
          <span className="text-sam-muted">{t("admin_notif_label_channel")}</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          >
            <option value="push_and_in_app">{t("admin_notif_channel_push_and_in_app")}</option>
            <option value="push_only">{t("admin_notif_channel_push_only")}</option>
            <option value="in_app_only">{t("admin_notif_channel_in_app_only")}</option>
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

        <p className="text-xs text-sam-muted">
          {t("admin_notif_sound_policy_readonly")}: {presentation.soundPolicyKey}
        </p>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_deeplink_url")}</span>
          <input
            value={deeplinkUrl}
            onChange={(e) => setDeeplinkUrl(e.target.value)}
            placeholder="/community"
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_web_url")}</span>
          <input
            value={webUrl}
            onChange={(e) => setWebUrl(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-sam-muted">{t("admin_notif_label_push_image")}</span>
            <input
              value={pushImageUrl}
              onChange={(e) => setPushImageUrl(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 text-[12px]"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-xs"
              onChange={(e) => void onUpload("push", e.target.files?.[0] ?? null)}
            />
            {presentation.pushImageUrl ? (
              <SamarketThumbnail
                src={presentation.pushImageUrl}
                alt=""
                className="mt-2 h-16 w-16 rounded-ui-rect object-cover"
                size={64}
              />
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="text-sam-muted">{t("admin_notif_label_in_app_image")}</span>
            <input
              value={inAppImageUrl}
              onChange={(e) => setInAppImageUrl(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 text-[12px]"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-xs"
              onChange={(e) => void onUpload("in_app", e.target.files?.[0] ?? null)}
            />
            {presentation.inAppImageUrl ? (
              <SamarketThumbnail
                src={presentation.inAppImageUrl}
                alt=""
                className="mt-2 h-16 w-16 rounded-ui-rect object-cover"
                size={64}
              />
            ) : null}
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_scheduled_at")}</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
          <p className="mt-1 text-xs text-amber-700">{t("admin_notif_scheduled_job_notice")}</p>
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_test_user_ids")}</span>
          <textarea
            value={testUserIds}
            onChange={(e) => setTestUserIds(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 font-mono text-[12px]"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <p className="text-xs font-semibold text-sam-fg">{t("admin_notif_preview_android_push")}</p>
          <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app p-2">
            {presentation.pushImageUrl ? (
              <SamarketThumbnail
                src={presentation.pushImageUrl}
                alt=""
                className="mb-2 h-20 w-full rounded-ui-rect object-cover"
                size={80}
              />
            ) : null}
            <p className="text-sm font-medium">{presentation.pushPayload.title}</p>
            <p className="text-xs text-sam-muted">{presentation.pushPayload.body}</p>
          </div>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <p className="text-xs font-semibold text-sam-fg">{t("admin_notif_preview_ios_push")}</p>
          <p className="mt-1 text-[11px] text-amber-700">{t("admin_notif_preview_ios_push_note")}</p>
          <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app p-2">
            <p className="text-sm font-medium">{presentation.pushPayload.title}</p>
            <p className="text-xs text-sam-muted">{presentation.pushPayload.body}</p>
          </div>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <p className="text-xs font-semibold text-sam-fg">{t("admin_notif_preview_in_app")}</p>
          <div className="mt-2 flex gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-2">
            {presentation.inAppPresentation.imageUrl ? (
              <SamarketThumbnail
                src={presentation.inAppPresentation.imageUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-ui-rect object-cover"
                size={40}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{presentation.inAppPresentation.title}</p>
              <p className="line-clamp-2 text-xs text-sam-muted">{presentation.inAppPresentation.body}</p>
            </div>
          </div>
          <p className="mt-1 truncate text-[11px] text-signature">{presentation.deepLink}</p>
        </div>
      </div>

      {confirmSend !== "none" ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-sam-fg">
            {confirmSend === "all" ? t("admin_notif_confirm_send_all_title") : t("admin_notif_confirm_send_title")}
          </p>
          <p className="mt-1 text-sm text-sam-muted">
            {confirmSend === "all" ? t("admin_notif_confirm_send_all_body") : t("admin_notif_confirm_send_body")}
          </p>
          {audience ? (
            <ul className="mt-2 space-y-1 text-xs text-sam-fg">
              <li>{t("admin_notif_audience_total_users", { count: audience.totalUsers })}</li>
              <li>{t("admin_notif_audience_push_users", { count: audience.pushEligibleUsers })}</li>
              <li>{t("admin_notif_audience_active_devices", { count: audience.activeDevices })}</li>
              <li>
                {t("admin_notif_audience_platforms", {
                  android: audience.androidDevices,
                  ios: audience.iosDevices,
                  web: audience.webDevices,
                })}
              </li>
              <li>
                {t("admin_notif_audience_excluded", {
                  count: audience.excludedOptOut + audience.excludedNoDevice + audience.excludedInvalidTarget,
                })}
              </li>
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit("send")}
              className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {t("admin_notif_btn_confirm_send")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmSend("none")}
              className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm"
            >
              {t("admin_notif_btn_cancel")}
            </button>
          </div>
        </div>
      ) : null}

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
          disabled={busy || !title.trim() || !body.trim() || !scheduledAt}
          onClick={() => void submit("schedule")}
          className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm disabled:opacity-40"
        >
          {t("admin_notif_btn_schedule")}
        </button>
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim() || channel === "test_only"}
          onClick={() => void openConfirm()}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("admin_notif_btn_save_send")}
        </button>
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim() || !testUserIds.trim()}
          onClick={() => void runTestSend()}
          className="rounded-ui-rect border border-signature px-4 py-2 text-sm text-signature disabled:opacity-40"
        >
          {t("admin_notif_btn_test_send")}
        </button>
      </div>
    </div>
  );
}
