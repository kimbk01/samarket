/**
 * 1:1 수신 VoIP/FCM dispatch — HTTP 응답 경로의 핵심 단계.
 *
 * CONTRACT:
 * - `call_sessions` 생성 이후 호출
 * - 수신자용 in-flight (dialing) call_stub publish 이전에 시작
 * - dispatch 실패는 session 생성 rollback 금지
 * - 동일 sessionId 에 대해 process 내 idempotent (중복 VoIP 방지)
 * - APNs 를 무기한 await 하지 않음 (budget 후 응답; in-flight work 는 완료까지 유지)
 */
import {
  sendIncomingCallPushBestEffort,
  type IncomingCallPushBestEffortInput,
} from "@/lib/community-messenger/service";

const DISPATCH_BUDGET_MS = 2_000;
const IDEMPOTENCY_TTL_MS = 5 * 60_000;

const dispatchedAtBySessionId = new Map<string, number>();

type IncomingCallPushSender = (input: IncomingCallPushBestEffortInput) => Promise<void>;

let pushSenderForTests: IncomingCallPushSender | null = null;

function pruneIdempotency(now: number): void {
  if (dispatchedAtBySessionId.size < 64) return;
  for (const [id, at] of dispatchedAtBySessionId) {
    if (now - at > IDEMPOTENCY_TTL_MS) dispatchedAtBySessionId.delete(id);
  }
}

export type IncomingCallVoipDispatchResult = {
  started: boolean;
  skippedDuplicate: boolean;
  completedWithinBudget: boolean;
  failed: boolean;
  failureReason?: string;
  sessionId: string;
  voip_dispatch_started_at: number;
  voip_dispatch_completed_at?: number;
  voip_dispatch_failed_at?: number;
};

function trimSessionId(input: IncomingCallPushBestEffortInput): string {
  return String(input.sessionId ?? "").trim();
}

/**
 * Critical-path VoIP dispatch. Never throws — call start HTTP must still succeed.
 */
export async function dispatchIncomingCallVoipOnCriticalPath(
  input: IncomingCallPushBestEffortInput
): Promise<IncomingCallVoipDispatchResult> {
  const sessionId = trimSessionId(input);
  const startedAt = Date.now();
  if (!sessionId) {
    return {
      started: false,
      skippedDuplicate: false,
      completedWithinBudget: true,
      failed: true,
      failureReason: "session_id_required",
      sessionId: "",
      voip_dispatch_started_at: startedAt,
      voip_dispatch_failed_at: startedAt,
    };
  }

  pruneIdempotency(startedAt);
  const prior = dispatchedAtBySessionId.get(sessionId);
  if (prior != null && startedAt - prior < IDEMPOTENCY_TTL_MS) {
    console.info("[cm-call-voip] voip_dispatch_skipped_duplicate", {
      sessionId,
      recipientUserId: input.recipientUserId,
      priorAt: prior,
    });
    return {
      started: false,
      skippedDuplicate: true,
      completedWithinBudget: true,
      failed: false,
      sessionId,
      voip_dispatch_started_at: startedAt,
      voip_dispatch_completed_at: startedAt,
    };
  }
  dispatchedAtBySessionId.set(sessionId, startedAt);

  console.info("[cm-call-voip] voip_dispatch_started", {
    sessionId,
    recipientUserId: input.recipientUserId,
    roomId: input.roomId,
    callKind: input.callKind,
    voip_dispatch_started_at: startedAt,
  });

  let failed = false;
  let failureReason: string | undefined;
  let completedAt: number | undefined;
  let failedAt: number | undefined;

  const send = pushSenderForTests ?? sendIncomingCallPushBestEffort;
  const work = send(input)
    .then(() => {
      completedAt = Date.now();
      console.info("[cm-call-voip] voip_dispatch_completed", {
        sessionId,
        recipientUserId: input.recipientUserId,
        voip_dispatch_started_at: startedAt,
        voip_dispatch_completed_at: completedAt,
        elapsed_ms: completedAt - startedAt,
      });
    })
    .catch((e) => {
      failed = true;
      failedAt = Date.now();
      failureReason = e instanceof Error ? e.message : String(e);
      console.error("[cm-call-voip] voip_dispatch_failed", {
        sessionId,
        recipientUserId: input.recipientUserId,
        voip_dispatch_started_at: startedAt,
        voip_dispatch_failed_at: failedAt,
        failureReason,
      });
    });

  const raced = await Promise.race([
    work.then(() => "done" as const),
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), DISPATCH_BUDGET_MS);
    }),
  ]);

  if (raced === "timeout") {
    console.info("[cm-call-voip] voip_dispatch_budget_elapsed", {
      sessionId,
      recipientUserId: input.recipientUserId,
      budget_ms: DISPATCH_BUDGET_MS,
      voip_dispatch_started_at: startedAt,
    });
    /** Keep `work` alive until settled so APNs can finish after HTTP returns. */
    void work;
  }

  return {
    started: true,
    skippedDuplicate: false,
    completedWithinBudget: raced === "done",
    failed,
    failureReason,
    sessionId,
    voip_dispatch_started_at: startedAt,
    voip_dispatch_completed_at: completedAt,
    voip_dispatch_failed_at: failedAt,
  };
}

/** Test / recovery — clear process-local idempotency. */
export function resetIncomingCallVoipDispatchIdempotencyForTests(): void {
  dispatchedAtBySessionId.clear();
}

/** Test only — inject push sender. */
export function setIncomingCallVoipPushSenderForTests(sender: IncomingCallPushSender | null): void {
  pushSenderForTests = sender;
}
