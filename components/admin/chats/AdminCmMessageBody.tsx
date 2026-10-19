"use client";

/**
 * 채팅 Admin R1 (B) — CM 메시지 본문 표시 (이미지·파일·음성·시스템·주문 요약·통화 기록).
 * 입력은 서버가 만든 `AdminCmMessageDisplay` (순수 타입). 첨부 URL 은 서버가 관리자 조회 라우트로 바꿔 둔 값이며,
 * 고스트 열람 화면은 `mediaReason` 을 라우트 `reason` 으로 덧붙인다 (서버가 검증·감사).
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminCmMessageDisplay, AdminCmMessageKind } from "@/lib/admin-community-messenger/admin-message-display";
import { isMessengerMediaRouteUrl } from "@/lib/community-messenger/media/messenger-media-ref";
import { CHAT_ADMIN_REASON_QUERY_PARAM } from "@/lib/admin/chat-admin/chat-content-access-policy";

function withMediaReason(url: string, reason: string | undefined): string {
  const r = (reason ?? "").trim();
  if (!r || !isMessengerMediaRouteUrl(url)) return url;
  return `${url}&${CHAT_ADMIN_REASON_QUERY_PARAM}=${encodeURIComponent(r)}`;
}

const KIND_KEY: Record<Exclude<AdminCmMessageKind, "text">, MessageKey> = {
  image: "admin_chat_r1b_kind_image",
  file: "admin_chat_r1b_kind_file",
  voice: "admin_chat_r1b_kind_voice",
  system: "admin_chat_r1b_kind_system",
  order_summary: "admin_chat_r1b_kind_order_summary",
  call_stub: "admin_chat_r1b_kind_call_stub",
  other: "admin_chat_r1b_kind_other",
};

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminCmMessageKindBadge({ kind }: { kind: AdminCmMessageKind }) {
  const { t } = useI18n();
  if (kind === "text") return null;
  return (
    <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-muted">{t(KIND_KEY[kind])}</span>
  );
}

export function AdminCmMessageBody({
  display,
  fallbackText,
  mediaReason,
}: {
  display: AdminCmMessageDisplay | null | undefined;
  fallbackText?: string;
  /** 고스트 열람 사유 (연결 근거 없는 방) */
  mediaReason?: string;
}) {
  const { t } = useI18n();
  if (!display) {
    return <p className="whitespace-pre-wrap text-sam-fg [overflow-wrap:anywhere]">{fallbackText ?? ""}</p>;
  }
  const textBlock = display.text.trim() ? (
    <p className="whitespace-pre-wrap text-sam-fg [overflow-wrap:anywhere]">{display.text}</p>
  ) : null;

  switch (display.kind) {
    case "image":
      return (
        <div className="space-y-1">
          {display.imageUrls.length ? (
            <div className="flex flex-wrap gap-1.5">
              {display.imageUrls.slice(0, 10).map((raw) => withMediaReason(raw, mediaReason)).map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" className="h-20 w-20 rounded-ui-rect border border-sam-border-soft object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="sam-text-helper text-sam-muted">{t("admin_chat_r1b_attachment_missing")}</p>
          )}
          {textBlock}
        </div>
      );
    case "file":
    case "voice":
      return (
        <div className="space-y-1">
          <p className="sam-text-helper text-sam-fg">
            {display.kind === "file"
              ? [display.fileName, formatBytes(display.fileSizeBytes)].filter(Boolean).join(" · ") || t("admin_chat_r1b_kind_file")
              : display.voiceDurationSeconds != null
                ? t("admin_chat_r1b_voice_seconds", { seconds: display.voiceDurationSeconds })
                : t("admin_chat_r1b_kind_voice")}
          </p>
          {display.attachmentUrl ? (
            display.kind === "voice" ? (
              <audio controls preload="none" src={withMediaReason(display.attachmentUrl, mediaReason)} className="h-8 max-w-full" />
            ) : (
              <a
                href={withMediaReason(display.attachmentUrl, mediaReason)}
                target="_blank"
                rel="noopener noreferrer"
                className="sam-text-helper font-medium text-signature hover:underline"
              >
                {t("admin_chat_r1b_open_attachment")}
              </a>
            )
          ) : (
            <p className="sam-text-helper text-sam-muted">{t("admin_chat_r1b_attachment_missing")}</p>
          )}
          {textBlock}
        </div>
      );
    case "order_summary":
      return (
        <div className="space-y-1">
          {display.orderSummary ? (
            <p className="sam-text-helper font-medium text-sam-fg">
              {t("admin_chat_r1b_order_summary_line", {
                orderNo: display.orderSummary.orderNo || "—",
                count: display.orderSummary.itemCount,
              })}
            </p>
          ) : null}
          {textBlock}
        </div>
      );
    case "call_stub":
      return (
        <p className="sam-text-helper text-sam-muted">
          {[display.callKind, display.callStatus].filter(Boolean).join(" · ") || t("admin_chat_r1b_kind_call_stub")}
        </p>
      );
    default:
      return textBlock ?? <p className="sam-text-helper text-sam-muted">—</p>;
  }
}
