"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import type { CampaignSendMode } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";

type Channel = "push_only" | "in_app_only" | "push_and_in_app" | "test_only";
type RecurrenceKind = "daily" | "weekly" | "monthly";

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
  const { t, safeT } = useI18n();
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
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [testUserIds, setTestUserIds] = useState("");
  const [appNoticeId, setAppNoticeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [confirmImmediate, setConfirmImmediate] = useState(false);
  const [sendMode, setSendMode] = useState<CampaignSendMode>("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>("weekly");
  const [recurrenceTime, setRecurrenceTime] = useState("09:00");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState(1);
  const [recurrenceStartAt, setRecurrenceStartAt] = useState("");
  const [recurrenceEndAt, setRecurrenceEndAt] = useState("");
  const [audience, setAudience] = useState<CampaignAudiencePreview | null>(null);

  useEffect(() => {
    const qType = searchParams.get("type");
    if (qType === "notice" || qType === "marketing" || qType === "system") setType(qType);
    // Optional draft only — never treat query body as Board original authority.
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

  const parseTargetUserIds = () =>
    targetType === "selected_users"
      ? selectedIds
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const buildPayload = (opts: {
    save_as_draft: boolean;
    send_mode: CampaignSendMode;
    create_request_id?: string;
    is_qa?: boolean;
  }) => {
    const scheduledIso =
      sendMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null;
    return {
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
      target_user_ids: parseTargetUserIds(),
      app_notice_id: appNoticeId.trim() || null,
      send_mode: opts.send_mode,
      save_as_draft: opts.save_as_draft,
      is_qa: opts.is_qa === true,
      scheduled_at: scheduledIso,
      create_request_id: opts.create_request_id,
      recurrence_kind: sendMode === "recurring" ? recurrenceKind : undefined,
      recurrence_time: sendMode === "recurring" ? recurrenceTime : null,
      recurrence_timezone: "Asia/Seoul",
      recurrence_start_at:
        sendMode === "recurring" && recurrenceStartAt
          ? new Date(recurrenceStartAt).toISOString()
          : sendMode === "recurring"
            ? new Date().toISOString()
            : null,
      recurrence_end_at:
        sendMode === "recurring" && recurrenceEndAt ? new Date(recurrenceEndAt).toISOString() : null,
      recurrence_weekday: sendMode === "recurring" && recurrenceKind === "weekly" ? recurrenceWeekday : null,
    };
  };

  const parseApiError = (j: { message?: string; error?: string }) => {
    if (typeof j.message === "string") return j.message;
    if (j.error === "segment_unsupported") return t("admin_notif_err_segment_unsupported");
    if (typeof j.error === "string") return j.error;
    return t("admin_notif_err_save");
  };

  const loadAudiencePreview = async () => {
    const res = await fetch("/api/admin/notification-campaigns/audience-preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        channel,
        target_type: targetType,
        segment_region_code: targetType === "region" ? regionCode : null,
        target_user_ids: parseTargetUserIds(),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      audience?: CampaignAudiencePreview;
      message?: string;
      error?: string;
    };
    if (!res.ok || !j.ok || !j.audience) {
      setErr(parseApiError(j));
      return null;
    }
    setAudience(j.audience);
    return j.audience;
  };

  const runCampaignSend = async (campaignId: string, occurrenceId: string) => {
    const sendKey = newClientIdempotencyKey();
    const sr = await fetch(`/api/admin/notification-campaigns/${campaignId}/send`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": sendKey,
      },
      body: JSON.stringify({
        occurrence_id: occurrenceId,
        idempotency_key: sendKey,
      }),
    });
    const sj = (await sr.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!sr.ok || !sj?.ok) {
      setErr(typeof sj?.error === "string" ? sj.error : t("admin_notif_err_save"));
      return false;
    }
    return true;
  };

  const createCampaign = async (opts: {
    save_as_draft: boolean;
    send_mode: CampaignSendMode;
    create_request_id?: string;
    is_qa?: boolean;
  }) => {
    const createRequestId = opts.create_request_id ?? newClientIdempotencyKey();
    const res = await fetch("/api/admin/notification-campaigns", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createRequestId,
      },
      body: JSON.stringify({
        ...buildPayload(opts),
        create_request_id: createRequestId,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      occurrence_id?: string | null;
      error?: string;
      message?: string;
    };
    if (!res.ok || !j?.ok || !j.id) {
      setErr(parseApiError(j));
      return null;
    }
    return { id: j.id, occurrenceId: j.occurrence_id ?? null };
  };

  const saveDraft = async () => {
    setErr(null);
    setBusy(true);
    try {
      const result = await createCampaign({ save_as_draft: true, send_mode: "immediate" });
      if (result) router.push(`/admin/notifications/${result.id}`);
    } finally {
      setBusy(false);
    }
  };

  const openReview = async () => {
    setErr(null);
    setBusy(true);
    try {
      const preview = await loadAudiencePreview();
      if (!preview) return;
      setShowReview(true);
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (sendMode === "scheduled" && !scheduledAt) {
      setErr(t("admin_notif_label_scheduled_at"));
      return;
    }
    if (sendMode === "immediate") {
      setConfirmImmediate(true);
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const createRequestId = newClientIdempotencyKey();
      const result = await createCampaign({
        save_as_draft: false,
        send_mode: sendMode,
        create_request_id: createRequestId,
      });
      if (result) router.push(`/admin/notifications/${result.id}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmImmediateSend = async () => {
    setErr(null);
    setBusy(true);
    try {
      const createRequestId = newClientIdempotencyKey();
      const result = await createCampaign({
        save_as_draft: false,
        send_mode: "immediate",
        create_request_id: createRequestId,
      });
      if (!result) return;
      if (result.occurrenceId) {
        await runCampaignSend(result.id, result.occurrenceId);
      }
      router.push(`/admin/notifications/${result.id}`);
    } finally {
      setBusy(false);
      setConfirmImmediate(false);
      setShowReview(false);
    }
  };

  const runTestSend = async () => {
    setErr(null);
    setBusy(true);
    try {
      const createRequestId = newClientIdempotencyKey();
      const userIds = testUserIds
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await createCampaign({
        save_as_draft: true,
        send_mode: "immediate",
        create_request_id: createRequestId,
        is_qa: true,
      });
      if (!result) return;
      const testKey = newClientIdempotencyKey();
      const tr = await fetch(`/api/admin/notification-campaigns/${result.id}/test-send`, {
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
      router.push(`/admin/notifications/${result.id}`);
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

  const reviewPrimaryLabel =
    sendMode === "scheduled"
      ? t("admin_notif_btn_confirm_schedule")
      : sendMode === "recurring"
        ? t("admin_notif_btn_start_recurring")
        : targetType === "all"
          ? t("admin_notif_btn_send_all_members")
          : t("admin_notif_btn_send_now");

  const formValid = Boolean(title.trim() && body.trim());

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
          <span className="mt-1 block text-xs text-sam-meta">
            {safeT("admin_notif_title_soft_guide", {
              fallbackKo: "권장: 알림 제목 40~50자 이하 (게시판 원본과 별도)",
              fallbackEn: "Guide: notification title ≤40–50 chars (separate from board original)",
            })}{" "}
            · {title.length}
          </span>
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_body")}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
          <span className="mt-1 block text-xs text-sam-meta">
            {safeT("admin_notif_body_soft_guide", {
              fallbackKo: "권장: 알림 내용 80~120자 이하 · 원본 본문 자동 축약 금지",
              fallbackEn: "Guide: notification body ≤80–120 chars · never auto-truncate board body",
            })}{" "}
            · {body.length}
          </span>
        </label>

        {appNoticeId.trim() ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {safeT("admin_notif_linked_content_hint", {
              fallbackKo: `연결 원본(content_id): ${appNoticeId.trim()} — Push/Bell은 짧은 알림 문구, 탭 시 보드 원본으로 이동합니다.`,
              fallbackEn: `Linked content_id: ${appNoticeId.trim()} — Push/Bell use short copy; tap opens the board original.`,
            })}
          </p>
        ) : (
          <p className="rounded border border-sam-border bg-sam-muted/10 px-3 py-2 text-xs text-sam-muted">
            {safeT("admin_notif_content_id_required_hint", {
              fallbackKo:
                "notice/system/marketing 캠페인은 고객센터 콘텐츠를 연결하세요(알림 발송 CTA). 순수 transport 예외는 별도 증명 전 금지.",
              fallbackEn:
                "Link Customer Center content for notice/system/marketing (via Send notification CTA). Pure-transport exception needs proven callers.",
            })}
          </p>
        )}

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

      {showReview ? (
        <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div>
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_notif_review_title")}</h2>
            <p className="mt-1 text-xs text-sam-muted">{t("admin_notif_preview_subtitle")}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm text-sam-muted">{t("admin_notif_label_send_mode")}</legend>
            {(["immediate", "scheduled", "recurring"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="send_mode"
                  checked={sendMode === mode}
                  onChange={() => setSendMode(mode)}
                />
                <span>
                  {mode === "immediate"
                    ? t("admin_notif_send_mode_immediate")
                    : mode === "scheduled"
                      ? t("admin_notif_send_mode_scheduled")
                      : t("admin_notif_send_mode_recurring")}
                </span>
              </label>
            ))}
          </fieldset>

          {sendMode === "scheduled" ? (
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
          ) : null}

          {sendMode === "recurring" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-sam-muted">{t("admin_notif_label_recurrence_kind")}</span>
                <select
                  value={recurrenceKind}
                  onChange={(e) => setRecurrenceKind(e.target.value as RecurrenceKind)}
                  className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
                >
                  <option value="daily">{t("admin_notif_recurrence_daily")}</option>
                  <option value="weekly">{t("admin_notif_recurrence_weekly")}</option>
                  <option value="monthly">{t("admin_notif_recurrence_monthly")}</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-sam-muted">{t("admin_notif_label_recurrence_time")}</span>
                <input
                  type="time"
                  value={recurrenceTime}
                  onChange={(e) => setRecurrenceTime(e.target.value)}
                  className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
                />
              </label>
              {recurrenceKind === "weekly" ? (
                <label className="block text-sm">
                  <span className="text-sam-muted">{t("admin_notif_label_recurrence_weekday")}</span>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={recurrenceWeekday}
                    onChange={(e) => setRecurrenceWeekday(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
                  />
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="text-sam-muted">{t("admin_notif_detail_created_at")}</span>
                <input
                  type="datetime-local"
                  value={recurrenceStartAt}
                  onChange={(e) => setRecurrenceStartAt(e.target.value)}
                  className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-sam-muted">{t("admin_notif_detail_scheduled_at")}</span>
                <input
                  type="datetime-local"
                  value={recurrenceEndAt}
                  onChange={(e) => setRecurrenceEndAt(e.target.value)}
                  className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
                />
              </label>
            </div>
          ) : null}

          {audience ? (
            <ul className="space-y-1 text-xs text-sam-fg">
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

          <div className="flex flex-wrap gap-2">
            {/* confirmImmediate open → single destructive authority lives in modal only */}
            {!confirmImmediate ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitReview()}
                className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {reviewPrimaryLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setConfirmImmediate(false);
                setShowReview(false);
              }}
              className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm"
            >
              {t("admin_notif_btn_cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {confirmImmediate ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-sam-fg">
            {targetType === "all" ? t("admin_notif_confirm_send_all_title") : t("admin_notif_confirm_send_title")}
          </p>
          <p className="mt-1 text-sm text-sam-muted">
            {targetType === "all" ? t("admin_notif_confirm_send_all_body") : t("admin_notif_confirm_send_body")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmImmediateSend()}
              className="rounded-ui-rect bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {targetType === "all" ? t("admin_notif_btn_send_all_members") : t("admin_notif_btn_send_now")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmImmediate(false)}
              className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm"
            >
              {t("admin_notif_btn_cancel")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sam-border pt-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !formValid}
            onClick={() => void saveDraft()}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {t("admin_notif_btn_draft")}
          </button>
          <button
            type="button"
            disabled={busy || !formValid}
            onClick={() => void openReview()}
            className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {t("admin_notif_btn_review")}
          </button>
        </div>
        <button
          type="button"
          disabled={busy || !formValid || !testUserIds.trim()}
          onClick={() => void runTestSend()}
          className="rounded-ui-rect border border-signature px-4 py-2 text-sm text-signature disabled:opacity-40"
        >
          {t("admin_notif_btn_test_send")}
        </button>
      </div>
    </div>
  );
}
