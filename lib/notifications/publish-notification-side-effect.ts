/**
 * 인앱 알림 DB 저장 직후 후처리.
 * - DEBUG_NOTIFICATIONS=1 → 서버 로그
 * - NOTIFICATION_WEBHOOK_URL → JSON POST (워커·n8n·자체 서비스 등)
 * - SLACK_NOTIFICATIONS_WEBHOOK_URL / DISCORD_NOTIFICATIONS_WEBHOOK_URL → 짧은 텍스트 알림
 * - Resend (NOTIFICATION_EMAIL_ENABLED=1 + RESEND_API_KEY) — `sb` 넘길 때만, `send-notification-email-resend.ts`
 *
 * 호출부는 `void` 로 붙여 두어 본 플로우를 막지 않습니다. 내부 실패는 로그만 남깁니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteOrigin } from "@/lib/env/runtime";
import { abortSignalForTimeout } from "@/lib/http/abort-signal-timeout";
import { trySendNotificationEmailResend } from "@/lib/notifications/send-notification-email-resend";
import { parseSafeWebhookUrl } from "@/lib/security/safe-webhook-url";

export type NotificationSideEffectPayload = {
  user_id: string;
  notification_type: string;
  title: string;
  body?: string | null;
  link_url?: string | null;
  meta?: Record<string, unknown> | null;
};

export type NotificationSideEffectPayloadOut = NotificationSideEffectPayload & {
  /** 상대 링크를 사이트 기준 절대 URL로 풀었을 때 (없으면 null) */
  link_url_absolute: string | null;
  occurred_at: string;
};

const FETCH_MS = 12_000;

function absolutizeLink(link: string | null | undefined): string | null {
  if (link == null || !String(link).trim()) return null;
  const s = String(link).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getSiteOrigin();
  if (!base) return null;
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function enrichPayload(payload: NotificationSideEffectPayload): NotificationSideEffectPayloadOut {
  return {
    ...payload,
    link_url_absolute: absolutizeLink(payload.link_url),
    occurred_at: new Date().toISOString(),
  };
}

function formatExternalLine(p: NotificationSideEffectPayloadOut): string {
  const kind =
    p.meta && typeof p.meta.kind === "string" ? p.meta.kind : p.notification_type;
  const parts = [
    "[Kasama 알림]",
    kind,
    `user=${truncate(p.user_id, 36)}`,
    truncate(p.title, 120),
  ];
  if (p.body) parts.push(truncate(p.body, 200));
  if (p.link_url_absolute) parts.push(p.link_url_absolute);
  else if (p.link_url) parts.push(p.link_url);
  return parts.join("\n");
}

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const signal = abortSignalForTimeout(FETCH_MS);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`http_${res.status}${t ? `: ${truncate(t, 80)}` : ""}`);
  }
}

export async function publishNotificationSideEffect(
  payload: NotificationSideEffectPayload,
  sb?: SupabaseClient | null
): Promise<void> {
  const out = enrichPayload(payload);

  if (process.env.DEBUG_NOTIFICATIONS === "1") {
    const kind =
      out.meta && typeof out.meta.kind === "string" ? out.meta.kind : undefined;
    console.info("[notification side-effect]", {
      user_id: out.user_id,
      notification_type: out.notification_type,
      kind,
      title: out.title,
      link_url: out.link_url ?? undefined,
      link_url_absolute: out.link_url_absolute ?? undefined,
    });
  }

  const hookRaw = process.env.NOTIFICATION_WEBHOOK_URL?.trim();
  if (hookRaw) {
    const hook = parseSafeWebhookUrl(hookRaw);
    if (!hook) {
      console.error(
        "[publishNotificationSideEffect] NOTIFICATION_WEBHOOK_URL rejected (invalid URL, non-HTTPS in prod, or private host)"
      );
    } else {
      try {
        const headers: Record<string, string> = {};
        const secret = process.env.NOTIFICATION_WEBHOOK_SECRET?.trim();
        if (secret) headers.Authorization = `Bearer ${secret}`;
        await postJson(hook, out, headers);
      } catch (e) {
        console.error("[publishNotificationSideEffect] NOTIFICATION_WEBHOOK_URL", e);
      }
    }
  }

  const slackRaw = process.env.SLACK_NOTIFICATIONS_WEBHOOK_URL?.trim();
  if (slackRaw) {
    const slack = parseSafeWebhookUrl(slackRaw);
    if (!slack) {
      console.error("[publishNotificationSideEffect] SLACK_NOTIFICATIONS_WEBHOOK_URL rejected (unsafe or invalid)");
    } else {
      try {
        await postJson(slack, { text: formatExternalLine(out) }, {});
      } catch (e) {
        console.error("[publishNotificationSideEffect] SLACK_NOTIFICATIONS_WEBHOOK_URL", e);
      }
    }
  }

  const discordRaw = process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL?.trim();
  if (discordRaw) {
    const discord = parseSafeWebhookUrl(discordRaw);
    if (!discord) {
      console.error("[publishNotificationSideEffect] DISCORD_NOTIFICATIONS_WEBHOOK_URL rejected (unsafe or invalid)");
    } else {
      try {
        const content = truncate(formatExternalLine(out), 1900);
        await postJson(discord, { content }, {});
      } catch (e) {
        console.error("[publishNotificationSideEffect] DISCORD_NOTIFICATIONS_WEBHOOK_URL", e);
      }
    }
  }

  if (sb) {
    try {
      await trySendNotificationEmailResend(sb, out);
    } catch (e) {
      console.error("[publishNotificationSideEffect] Resend email", e);
    }
  }
}
