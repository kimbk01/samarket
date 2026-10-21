/**
 * D-2: 「모두에게서 삭제」 후 알림센터(`notification_events`)·이후 발송될 푸시 본문에 원문이 남지 않게
 * 해당 메시지(`message_id`)의 알림 본문을 삭제 placeholder 로 바꾼다.
 *
 * - `title` 은 보낸 사람·방 이름(원문 아님)이라 유지한다. 원문이 들어가는 `body` 와
 *   `display_payload.previewText`·`display_payload.body` 만 교체한다.
 * - best-effort: 어떤 실패도 삭제 결과를 바꾸지 않는다(호출부에서 try/catch + 로그).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationEventRowLite = {
  id?: string | null;
  body?: string | null;
  display_payload?: unknown;
};

/** 한 번에 다루는 알림 행 상한(대형 그룹방 보호) */
export const MESSENGER_DELETED_NOTIFICATION_SCRUB_MAX_ROWS = 2000;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * 그룹·거래 알림 본문은 `보낸사람: 미리보기` 형식 — 접두는 유지하고 미리보기만 바꾼다.
 */
export function scrubDeletedMessageNotificationBody(input: {
  body: string | null | undefined;
  senderName: string | null | undefined;
  placeholder: string;
}): string {
  const body = String(input.body ?? "");
  const sender = String(input.senderName ?? "").trim();
  if (sender && body.startsWith(`${sender}: `)) return `${sender}: ${input.placeholder}`;
  return input.placeholder;
}

export function scrubDeletedMessageNotificationRow(
  row: NotificationEventRowLite,
  placeholder: string
): { body: string; display_payload: Record<string, unknown> } {
  const payload = asRecord(row.display_payload) ?? {};
  const senderName = typeof payload.senderName === "string" ? payload.senderName : null;
  const body = scrubDeletedMessageNotificationBody({ body: row.body, senderName, placeholder });
  if (Object.keys(payload).length === 0) return { body, display_payload: {} };
  const next: Record<string, unknown> = { ...payload, previewText: placeholder };
  if ("body" in payload) {
    next.body = scrubDeletedMessageNotificationBody({
      body: typeof payload.body === "string" ? payload.body : "",
      senderName,
      placeholder,
    });
  }
  next.previewKind = "deleted";
  return { body, display_payload: next };
}

export async function scrubNotificationEventsForDeletedMessage(
  sb: SupabaseClient<any>,
  input: { roomId: string; messageId: string; placeholder: string }
): Promise<{ updated: number }> {
  const messageId = input.messageId.trim();
  const roomId = input.roomId.trim();
  if (!messageId || !roomId) return { updated: 0 };

  const { data, error } = await sb
    .from("notification_events")
    .select("id, body, display_payload")
    .eq("message_id", messageId)
    .eq("room_id", roomId)
    .limit(MESSENGER_DELETED_NOTIFICATION_SCRUB_MAX_ROWS);
  if (error) throw new Error(String(error.message ?? "notification_events_select_failed"));
  const rows = (data ?? []) as NotificationEventRowLite[];
  if (rows.length === 0) return { updated: 0 };

  /** 수신자별 payload 는 언어·방 이름 정도만 달라 — 같은 결과끼리 묶어 update 호출 수를 줄인다 */
  const groups = new Map<string, { patch: { body: string; display_payload: Record<string, unknown> }; ids: string[] }>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const patch = scrubDeletedMessageNotificationRow(row, input.placeholder);
    const key = JSON.stringify(patch);
    const g = groups.get(key);
    if (g) g.ids.push(id);
    else groups.set(key, { patch, ids: [id] });
  }

  let updated = 0;
  for (const { patch, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: upErr } = await sb.from("notification_events").update(patch).in("id", chunk);
      if (upErr) throw new Error(String(upErr.message ?? "notification_events_update_failed"));
      updated += chunk.length;
    }
  }
  return { updated };
}
