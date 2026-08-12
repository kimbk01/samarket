"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import type { CampaignSendMode } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import {
  BOARD_LABEL,
  parseCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";

type Channel = "push_only" | "in_app_only" | "push_and_in_app" | "test_only";
type RecurrenceKind = "daily" | "weekly" | "monthly";

type LinkedContent = {
  id: string;
  content_type: string;
  title: string;
  hero_image_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

type NoticePickRow = {
  id: string;
  title: string;
  content_type?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

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
  const { t, safeT, language } = useI18n();
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
  const [linkedContent, setLinkedContent] = useState<LinkedContent | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerRows, setPickerRows] = useState<NoticePickRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
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

  const loadLinkedContent = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) {
      setLinkedContent(null);
      return;
    }
    setLinkedLoading(true);
    try {
      const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(trimmed)}`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notice?: LinkedContent;
      };
      if (res.ok && j.ok && j.notice) {
        setLinkedContent(j.notice);
        const ct = parseCustomerCenterContentType(j.notice.content_type, "notice");
        setType(ct);
        // Bind identity only — never auto-fill campaign title/body from board original.
        setDeeplinkUrl(buildCustomerCenterBoardDetailPath(ct, j.notice.id));
      } else {
        setLinkedContent(null);
      }
    } finally {
      setLinkedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinkedContent(appNoticeId);
  }, [appNoticeId, loadLinkedContent]);

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await fetch("/api/admin/app-notices", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notices?: NoticePickRow[];
      };
      setPickerRows(res.ok && j.ok && Array.isArray(j.notices) ? j.notices : []);
    } finally {
      setPickerLoading(false);
    }
  };

  const selectLinkedContent = (row: NoticePickRow) => {
    const ct = parseCustomerCenterContentType(row.content_type, "notice");
    setAppNoticeId(row.id);
    setType(ct);
    setDeeplinkUrl(buildCustomerCenterBoardDetailPath(ct, row.id));
    // NEVER auto-update campaign title/body from content.
    setPickerOpen(false);
    setPickerQ("");
  };

  const clearLinkedContent = () => {
    setAppNoticeId("");
    setLinkedContent(null);
  };

  const useHeroFor = (kind: "push" | "in_app") => {
    const url =
      typeof linkedContent?.hero_image_url === "string" ? linkedContent.hero_image_url.trim() : "";
    if (!url) return;
    if (kind === "push") setPushImageUrl(url);
    else setInAppImageUrl(url);
  };

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
  const linkedId = appNoticeId.trim();
  const linkedType: CustomerCenterContentType | null = linkedContent
    ? parseCustomerCenterContentType(linkedContent.content_type, type)
    : linkedId
      ? type
      : null;
  const boardLabel =
    linkedType != null ? BOARD_LABEL[linkedType][language === "en" ? "en" : "ko"] : "";
  const memberDeeplink =
    linkedId && linkedType ? buildCustomerCenterBoardDetailPath(linkedType, linkedId) : deeplinkUrl;
  const createdLabel = linkedContent?.created_at
    ? String(linkedContent.created_at).slice(0, 16).replace("T", " ")
    : "—";
  const statusLabel =
    linkedContent?.is_active !== false
      ? safeT("admin_app_status_visible", { fallbackKo: "게시", fallbackEn: "Published" })
      : safeT("admin_app_status_hidden", { fallbackKo: "숨김", fallbackEn: "Hidden" });

  const pickerFiltered = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    if (!q) return pickerRows;
    return pickerRows.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        String(r.title ?? "")
          .toLowerCase()
          .includes(q)
    );
  }, [pickerQ, pickerRows]);

  const sectionTitle = (
    key:
      | "admin_notif_section_linked_content"
      | "admin_notif_section_delivery_copy"
      | "admin_notif_section_delivery_images"
      | "admin_notif_section_send_policy"
      | "admin_notif_section_channel_preview",
    ko: string,
    en: string
  ) => (
    <h2 className="text-sm font-semibold text-sam-fg">
      {safeT(key, { fallbackKo: ko, fallbackEn: en })}
    </h2>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← {t("admin_back_to_list")}
      </Link>
      <h1 className="text-lg font-semibold text-sam-fg">{t("admin_notif_page_create")}</h1>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {/* A. Linked original content */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        {sectionTitle("admin_notif_section_linked_content", "A. 연결 원본", "A. Linked original")}
        {linkedLoading ? (
          <p className="text-xs text-sam-muted">{t("common_loading")}</p>
        ) : linkedId && linkedContent ? (
          <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-start gap-3">
              {linkedContent.hero_image_url ? (
                <SamarketThumbnail
                  src={String(linkedContent.hero_image_url)}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-ui-rect object-cover"
                  size={56}
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <span className="inline-block rounded-ui-rect bg-sam-app px-1.5 py-0.5 text-[11px] font-medium text-sam-muted">
                  {boardLabel}
                </span>
                <p className="break-words text-sm font-semibold text-sam-fg">{linkedContent.title}</p>
                <p className="font-mono text-[11px] text-sam-meta">
                  {safeT("admin_notif_content_id_label", {
                    fallbackKo: "콘텐츠 ID",
                    fallbackEn: "Content ID",
                  })}
                  : {linkedContent.id}
                </p>
                <p className="text-[11px] text-sam-muted">
                  {statusLabel} · {createdLabel}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/app/notices/${encodeURIComponent(linkedContent.id)}`}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-medium text-signature"
              >
                {safeT("admin_notif_btn_view_original", {
                  fallbackKo: "원본 보기",
                  fallbackEn: "View original",
                })}
              </Link>
              {memberDeeplink ? (
                <Link
                  href={memberDeeplink}
                  className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-muted"
                >
                  {safeT("admin_notif_btn_member_deeplink", {
                    fallbackKo: "회원 딥링크",
                    fallbackEn: "Member deeplink",
                  })}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void openPicker()}
                className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs"
              >
                {safeT("admin_notif_btn_change_original", {
                  fallbackKo: "원본 변경",
                  fallbackEn: "Change original",
                })}
              </button>
              <button
                type="button"
                onClick={clearLinkedContent}
                className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-muted"
              >
                {safeT("admin_notif_btn_unlink_original", {
                  fallbackKo: "연결 해제",
                  fallbackEn: "Unlink",
                })}
              </button>
            </div>
            <label className="block text-sm">
              <span className="text-xs text-sam-muted">
                {safeT("admin_notif_label_type_secondary", {
                  fallbackKo: "유형 (보조)",
                  fallbackEn: "Type (secondary)",
                })}
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="mt-1 w-full max-w-xs rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
              >
                <option value="notice">{t("admin_notif_type_notice")}</option>
                <option value="marketing">{t("admin_notif_type_marketing_opt_in")}</option>
                <option value="system">{t("admin_notif_type_system")}</option>
              </select>
            </label>
          </div>
        ) : linkedId ? (
          <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-amber-50/60 p-3">
            <p className="font-mono text-xs text-sam-fg">
              {safeT("admin_notif_content_id_label", {
                fallbackKo: "콘텐츠 ID",
                fallbackEn: "Content ID",
              })}
              : {linkedId}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/app/notices/${encodeURIComponent(linkedId)}`}
                className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-signature"
              >
                {safeT("admin_notif_btn_view_original", {
                  fallbackKo: "원본 보기",
                  fallbackEn: "View original",
                })}
              </Link>
              <button
                type="button"
                onClick={() => void openPicker()}
                className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs"
              >
                {safeT("admin_notif_btn_change_original", {
                  fallbackKo: "원본 변경",
                  fallbackEn: "Change original",
                })}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-ui-rect border border-dashed border-sam-border bg-sam-muted/10 p-3">
            <p className="text-sm text-sam-fg">
              {safeT("admin_notif_pure_transport_box", {
                fallbackKo: "[단순 알림] 연결된 게시물이 없습니다.",
                fallbackEn: "[Pure transport] No linked post.",
              })}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[140px] flex-1 text-sm">
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
              <button
                type="button"
                onClick={() => void openPicker()}
                className="rounded-ui-rect border border-signature px-3 py-2 text-sm text-signature"
              >
                {safeT("admin_notif_btn_link_original", {
                  fallbackKo: "원본 연결",
                  fallbackEn: "Link original",
                })}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* B. Delivery summary */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        {sectionTitle("admin_notif_section_delivery_copy", "B. 알림 문구", "B. Delivery copy")}
        <p className="text-xs text-sam-muted">
          {safeT("admin_notif_delivery_copy_help", {
            fallbackKo:
              "Push/Bell에 보이는 짧은 문구입니다. 게시판 원문은 연결된 콘텐츠입니다(자동 복사·축약 없음).",
            fallbackEn:
              "Short Push/Bell copy. Board original is the linked content (no auto-copy or truncate).",
          })}
        </p>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_notif_label_title", {
              fallbackKo: "알림 제목",
              fallbackEn: "Notification title",
            })}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
          <span className="mt-1 block text-xs text-sam-meta">
            {safeT("admin_notif_title_soft_guide", {
              fallbackKo: "권장: 알림 제목 40~50자 이하 · 게시글 원문이 아닙니다",
              fallbackEn: "Guide: notification title ≤40–50 chars · not the board original",
            })}{" "}
            · {title.length}
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_notif_label_body", {
              fallbackKo: "알림 메시지",
              fallbackEn: "Notification message",
            })}
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
          <span className="mt-1 block text-xs text-sam-meta">
            {safeT("admin_notif_body_soft_guide", {
              fallbackKo: "권장: 알림 메시지 80~120자 이하 · 게시글 원문이 아닙니다",
              fallbackEn: "Guide: notification message ≤80–120 chars · not the board original",
            })}{" "}
            · {body.length}
          </span>
        </label>
      </section>

      {/* C. Delivery images */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        {sectionTitle("admin_notif_section_delivery_images", "C. 알림 이미지", "C. Delivery images")}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 text-sm">
            <span className="text-sam-muted">{t("admin_notif_label_push_image")}</span>
            <input
              value={pushImageUrl}
              onChange={(e) => setPushImageUrl(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 text-[12px]"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-xs"
              onChange={(e) => void onUpload("push", e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={!linkedContent?.hero_image_url}
              onClick={() => useHeroFor("push")}
              className="rounded-ui-rect border border-sam-border px-2 py-1 text-xs disabled:opacity-40"
            >
              {safeT("admin_notif_btn_use_hero_image", {
                fallbackKo: "원본 대표 이미지 사용",
                fallbackEn: "Use original hero image",
              })}
            </button>
            {presentation.pushImageUrl ? (
              <SamarketThumbnail
                src={presentation.pushImageUrl}
                alt=""
                className="h-16 w-16 rounded-ui-rect object-cover"
                size={64}
              />
            ) : null}
          </div>
          <div className="space-y-2 text-sm">
            <span className="text-sam-muted">{t("admin_notif_label_in_app_image")}</span>
            <input
              value={inAppImageUrl}
              onChange={(e) => setInAppImageUrl(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 text-[12px]"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-xs"
              onChange={(e) => void onUpload("in_app", e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={!linkedContent?.hero_image_url}
              onClick={() => useHeroFor("in_app")}
              className="rounded-ui-rect border border-sam-border px-2 py-1 text-xs disabled:opacity-40"
            >
              {safeT("admin_notif_btn_use_hero_image", {
                fallbackKo: "원본 대표 이미지 사용",
                fallbackEn: "Use original hero image",
              })}
            </button>
            {presentation.inAppImageUrl ? (
              <SamarketThumbnail
                src={presentation.inAppImageUrl}
                alt=""
                className="h-16 w-16 rounded-ui-rect object-cover"
                size={64}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* D. Send policy */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        {sectionTitle("admin_notif_section_send_policy", "D. 발송 정책", "D. Send policy")}

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

        <label className="block text-sm">
          <span className="text-sam-muted">{t("admin_notif_label_test_user_ids")}</span>
          <textarea
            value={testUserIds}
            onChange={(e) => setTestUserIds(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 font-mono text-[12px]"
          />
        </label>
      </section>

      {/* E. Channel preview */}
      <section className="space-y-3">
        {sectionTitle("admin_notif_section_channel_preview", "E. 채널 미리보기", "E. Channel preview")}
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
      </section>

      {showReview ? (
        <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div>
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_notif_review_title")}</h2>
            <p className="mt-1 text-xs text-sam-muted">{t("admin_notif_preview_subtitle")}</p>
            <p className="mt-1 text-xs text-sam-muted">
              {t("admin_notif_label_send_mode")}:{" "}
              {sendMode === "immediate"
                ? t("admin_notif_send_mode_immediate")
                : sendMode === "scheduled"
                  ? t("admin_notif_send_mode_scheduled")
                  : t("admin_notif_send_mode_recurring")}
            </p>
          </div>

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

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
              <h3 className="text-sm font-semibold text-sam-fg">
                {safeT("admin_notif_picker_title", {
                  fallbackKo: "원본 콘텐츠 선택",
                  fallbackEn: "Select original content",
                })}
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-sm text-sam-muted"
              >
                {t("admin_notif_btn_cancel")}
              </button>
            </div>
            <div className="space-y-2 p-4">
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder={safeT("admin_notif_picker_search_ph", {
                  fallbackKo: "제목 또는 ID 검색",
                  fallbackEn: "Search title or ID",
                })}
                className="w-full rounded border border-sam-border bg-sam-app px-2 py-2 text-sm"
              />
              {pickerLoading ? (
                <p className="text-xs text-sam-muted">{t("common_loading")}</p>
              ) : (
                <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                  {pickerFiltered.map((row) => {
                    const ct = parseCustomerCenterContentType(row.content_type, "notice");
                    const label = BOARD_LABEL[ct][language === "en" ? "en" : "ko"];
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => selectLinkedContent(row)}
                          className="w-full rounded-ui-rect border border-sam-border-soft px-3 py-2 text-left hover:bg-sam-muted/10"
                        >
                          <span className="mr-2 text-[11px] text-sam-muted">{label}</span>
                          <span className="text-sm font-medium text-sam-fg">{row.title}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-sam-meta">{row.id}</span>
                        </button>
                      </li>
                    );
                  })}
                  {pickerFiltered.length === 0 ? (
                    <li className="py-6 text-center text-xs text-sam-muted">
                      {safeT("admin_notif_picker_empty", {
                        fallbackKo: "검색 결과가 없습니다",
                        fallbackEn: "No results",
                      })}
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
