import type { SupabaseClient } from "@supabase/supabase-js";
import { abortSignalForTimeout } from "@/lib/http/abort-signal-timeout";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const FETCH_MS = 12_000;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildNotificationEmailHtml(out: NotificationSideEffectPayloadOut): string {
  const title = escapeHtml(out.title);
  const body = (out.body ?? "").trim();
  const bodyHtml = body
    ? `<p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`
    : "";
  const link = (out.link_url_absolute ?? out.link_url ?? "").trim();
  const linkSafe = escapeHtml(link);
  const linkHtml = link
    ? `<p style="margin:24px 0 0;"><a href="${linkSafe}" style="color:#2563eb;text-decoration:underline;">앱에서 보기</a></p>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
    <p style="margin:0;font-size:17px;font-weight:600;color:#111827;">${title}</p>
    ${bodyHtml}
    ${linkHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">이 메일은 Kasama 서비스 알림입니다.</p>
  </div></body></html>`;
}

async function loadProfileEmailRow(
  sb: SupabaseClient,
  uid: string
): Promise<{ email: string | null; commerceEmailAllowed: boolean }> {
  const wide = await sb.from("profiles").select("email, notify_commerce_email").eq("id", uid).maybeSingle();
  if (!wide.error && wide.data != null) {
    const row = wide.data as { email?: string | null; notify_commerce_email?: boolean | null };
    const email = typeof row.email === "string" && row.email.includes("@") ? row.email.trim() : null;
    const commerceEmailAllowed = row.notify_commerce_email !== false;
    return { email, commerceEmailAllowed };
  }

  const narrow = await sb.from("profiles").select("email").eq("id", uid).maybeSingle();
  if (!narrow.error && narrow.data != null) {
    const row = narrow.data as { email?: string | null };
    const email = typeof row.email === "string" && row.email.includes("@") ? row.email.trim() : null;
    return { email, commerceEmailAllowed: true };
  }

  return { email: null, commerceEmailAllowed: true };
}

/** profiles → 없으면 auth.users (서비스 롤). commerce 알림이면 notify_commerce_email=false 이면 null */
async function resolveEmailRecipient(
  sb: SupabaseClient,
  userId: string,
  isCommerceNotification: boolean
): Promise<string | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const { email, commerceEmailAllowed } = await loadProfileEmailRow(sb, uid);
  if (isCommerceNotification && !commerceEmailAllowed) return null;
  if (email) return email;

  try {
    const { data, error } = await sb.auth.admin.getUserById(uid);
    if (error || !data?.user?.email) return null;
    const e = String(data.user.email).trim();
    return e.includes("@") ? e : null;
  } catch {
    return null;
  }
}

function passesTypeFilter(notificationType: string): boolean {
  const raw = process.env.NOTIFICATION_EMAIL_TYPES?.trim();
  if (!raw || raw === "commerce") return notificationType === "commerce";
  if (raw === "*" || raw === "all") return true;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.has(notificationType);
}

function passesKindFilter(meta: Record<string, unknown> | null | undefined): boolean {
  const raw = process.env.NOTIFICATION_EMAIL_KINDS?.trim();
  if (!raw) return true;
  const kinds = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const k = meta && typeof meta.kind === "string" ? meta.kind : "";
  return k ? kinds.has(k) : false;
}

/**
 * NOTIFICATION_EMAIL_ENABLED=1 + RESEND_API_KEY + NOTIFICATION_EMAIL_FROM(권장) 일 때만 발송.
 * 기본은 notification_type이 commerce 인 알림만 (NOTIFICATION_EMAIL_TYPES 로 확장 가능).
 * commerce 타입이면 profiles.notify_commerce_email=false 인 사용자는 스킵 (컬럼 없으면 전부 수신).
 */
export async function trySendNotificationEmailResend(
  sb: SupabaseClient,
  out: NotificationSideEffectPayloadOut
): Promise<void> {
  if (process.env.NOTIFICATION_EMAIL_ENABLED !== "1") return;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;
  if (!passesTypeFilter(out.notification_type)) return;
  if (!passesKindFilter(out.meta)) return;

  const isCommerce = out.notification_type === "commerce";
  const to = await resolveEmailRecipient(sb, out.user_id, isCommerce);
  if (!to) return;

  const from =
    process.env.NOTIFICATION_EMAIL_FROM?.trim() ||
    "Kasama <onboarding@resend.dev>";

  const parts: string[] = [out.title];
  const body = (out.body ?? "").trim();
  if (body) {
    parts.push("");
    parts.push(body);
  }
  const link = (out.link_url_absolute ?? out.link_url ?? "").trim();
  if (link) {
    parts.push("");
    parts.push(`링크: ${link}`);
  }
  const text = truncate(parts.join("\n"), 12_000);
  const html = buildNotificationEmailHtml(out);

  const signal = abortSignalForTimeout(FETCH_MS);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: truncate(out.title, 200),
      text: truncate(text, 12_000),
      html: truncate(html, 100_000),
    }),
    ...(signal ? { signal } : {}),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`resend_${res.status}${t ? `: ${truncate(t, 120)}` : ""}`);
  }
}
