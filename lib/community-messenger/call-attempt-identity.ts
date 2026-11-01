/**
 * 발신 시도(attempt) 식별자 계약 — android-caller-stuck-after-remote-missed-design §15-4.
 *
 * 시도 ID 는 클라이언트(웹)가 발신을 누를 때 만들고 세션 생성 요청에 함께 보낸다. 서버는 그 시도로 만든 통화를
 * `community_messenger_call_sessions.client_attempt_id` 로 기억하고, 생성 전에 그만둔 시도는
 * `community_messenger_call_attempt_cancellations` 에 남긴다.
 *
 * 경합 계약: 생성은 「통화 삽입 → 취소 기록 확인」, 취소는 「취소 기록 → 통화 확인」 순서로 쓰고 읽는다.
 * 각 단계가 따로 커밋되므로 둘 중 하나는 반드시 상대의 쓰기를 본다 → 취소된 시도의 통화가 울린 채 남지 않는다.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CALL_ATTEMPT_CANCELLED_ERROR = "call_attempt_cancelled";
export const CALL_ATTEMPT_ENDED_ERROR = "call_attempt_ended";
export const CALL_ATTEMPT_CONFLICT_ERROR = "call_attempt_conflict";

const CANCELLATIONS_TABLE = "community_messenger_call_attempt_cancellations";
const SESSIONS_TABLE = "community_messenger_call_sessions";

/** 클라이언트 시도 ID — UUID 만 허용(소문자). 그 외는 null(시도 계약 없이 기존 동작). */
export function normalizeClientAttemptId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

export async function isCallAttemptCancelled(
  sb: SupabaseLike,
  initiatorUserId: string,
  clientAttemptId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from(CANCELLATIONS_TABLE)
    .select("client_attempt_id")
    .eq("initiator_user_id", initiatorUserId)
    .eq("client_attempt_id", clientAttemptId)
    .maybeSingle();
  if (error) throw new Error(`call_attempt_cancel_lookup_failed:${String(error.message ?? "")}`);
  return Boolean(data);
}

/** 멱등 — 이미 있으면 그대로. */
export async function recordCallAttemptCancellation(
  sb: SupabaseLike,
  initiatorUserId: string,
  clientAttemptId: string,
): Promise<void> {
  const { error } = await sb
    .from(CANCELLATIONS_TABLE)
    .upsert(
      { initiator_user_id: initiatorUserId, client_attempt_id: clientAttemptId },
      { onConflict: "initiator_user_id,client_attempt_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`call_attempt_cancel_record_failed:${String(error.message ?? "")}`);
}

export type CallAttemptSessionRef = { id: string; status: string };

export async function findCallSessionByAttempt(
  sb: SupabaseLike,
  initiatorUserId: string,
  clientAttemptId: string,
): Promise<CallAttemptSessionRef | null> {
  const { data, error } = await sb
    .from(SESSIONS_TABLE)
    .select("id, status")
    .eq("initiator_user_id", initiatorUserId)
    .eq("client_attempt_id", clientAttemptId)
    .maybeSingle();
  if (error) throw new Error(`call_attempt_session_lookup_failed:${String(error.message ?? "")}`);
  if (!data?.id) return null;
  return { id: String(data.id), status: String(data.status ?? "") };
}

/**
 * 생성 경로 전용 — 조회 실패로 통화 시작 자체를 막지 않는다(기록 후 「취소 아님」으로 진행).
 * 시도 취소 API 는 throw 버전을 써서 실패를 클라이언트가 다시 시도하게 한다.
 */
export async function isCallAttemptCancelledForCreate(
  sb: SupabaseLike,
  initiatorUserId: string,
  clientAttemptId: string,
): Promise<boolean> {
  try {
    return await isCallAttemptCancelled(sb, initiatorUserId, clientAttemptId);
  } catch (err) {
    console.error("[call-attempt] cancel_lookup_failed_on_create", {
      initiatorUserId,
      clientAttemptId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function findCallSessionByAttemptForCreate(
  sb: SupabaseLike,
  initiatorUserId: string,
  clientAttemptId: string,
): Promise<CallAttemptSessionRef | null> {
  try {
    return await findCallSessionByAttempt(sb, initiatorUserId, clientAttemptId);
  } catch (err) {
    console.error("[call-attempt] session_lookup_failed_on_create", {
      initiatorUserId,
      clientAttemptId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type RingingTransferResult =
  /** 새 시도가 넘겨받음 — 그대로 쓰면 된다 */
  | "transferred"
  /** 울리는 중이 아니라 넘겨받지 못함 */
  | "not_transferred"
  /** 넘겨받았지만 이전 시도가 취소 중/취소됨 — 이 통화는 쓰지 말고 정리한다 */
  | "previous_attempt_cancelled"
  /** 넘겨받았지만 새 시도 자체가 이미 취소됨 */
  | "new_attempt_cancelled";

/**
 * 울리는 내 통화를 새 시도가 넘겨받는다(§15-4 「1회 통화」 재사용). 결과가 순서와 상관없이 하나로 정해지도록:
 * ① 울리는 중일 때만 시도 ID 를 옮기고 ② 옮긴 **뒤** 이전 시도의 취소 기록을 본다. 이전 시도 취소는
 * 「기록 → 시도로 통화 찾기 → 통화 취소」라서, 옮긴 뒤 기록이 보이면 그 취소가 이 통화를 끊을 수 있다 → 쓰지 않는다.
 * 기록이 안 보이면 이후 이전 시도의 취소는 시도 ID 로 이 통화를 찾지 못한다(이미 옮김) → 끊지 못한다.
 */
export async function transferRingingSessionToAttempt(
  sb: SupabaseLike,
  initiatorUserId: string,
  sessionId: string,
  newAttemptId: string,
): Promise<RingingTransferResult> {
  const { data: before } = await sb
    .from(SESSIONS_TABLE)
    .select("client_attempt_id")
    .eq("id", sessionId)
    .maybeSingle();
  const previousAttemptId =
    before && typeof before.client_attempt_id === "string" ? before.client_attempt_id : null;
  if (previousAttemptId === newAttemptId) return "transferred";
  const { data: transferred } = await sb
    .from(SESSIONS_TABLE)
    .update({ client_attempt_id: newAttemptId })
    .eq("id", sessionId)
    .eq("initiator_user_id", initiatorUserId)
    .eq("status", "ringing")
    .select("id")
    .maybeSingle();
  if (!transferred?.id) return "not_transferred";
  if (previousAttemptId && (await isCallAttemptCancelledForCreate(sb, initiatorUserId, previousAttemptId))) {
    return "previous_attempt_cancelled";
  }
  if (await isCallAttemptCancelledForCreate(sb, initiatorUserId, newAttemptId)) {
    return "new_attempt_cancelled";
  }
  return "transferred";
}
