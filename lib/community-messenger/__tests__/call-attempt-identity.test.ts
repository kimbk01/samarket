import { describe, expect, it, vi } from "vitest";
import {
  findCallSessionByAttempt,
  findCallSessionByAttemptForCreate,
  isCallAttemptCancelled,
  isCallAttemptCancelledForCreate,
  normalizeClientAttemptId,
  recordCallAttemptCancellation,
  transferRingingSessionToAttempt,
} from "@/lib/community-messenger/call-attempt-identity";

/** android-caller-stuck-after-remote-missed-design §15-4 — 서버 발신 시도 식별자 도우미 */
const A = "6f106d55-77aa-4b18-b2c8-efe5311751ed";

function fakeSb(result: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => result;
  chain.upsert = async (...args: unknown[]) => {
    calls.push(["upsert", ...args]);
    return { error: result.error ?? null };
  };
  return { sb: { from: (t: string) => (calls.push(["from", t]), chain) }, calls };
}

describe("call-attempt-identity", () => {
  it("UUID 만 시도 ID 로 받는다(소문자)", () => {
    expect(normalizeClientAttemptId(A.toUpperCase())).toBe(A);
    expect(normalizeClientAttemptId("attempt_1_abc")).toBeNull();
    expect(normalizeClientAttemptId(123)).toBeNull();
    expect(normalizeClientAttemptId("")).toBeNull();
  });

  it("취소 기록은 본인·시도 키로 멱등 upsert", async () => {
    const { sb, calls } = fakeSb({});
    await recordCallAttemptCancellation(sb, "u1", A);
    expect(calls).toContainEqual(["from", "community_messenger_call_attempt_cancellations"]);
    expect(calls).toContainEqual([
      "upsert",
      { initiator_user_id: "u1", client_attempt_id: A },
      { onConflict: "initiator_user_id,client_attempt_id", ignoreDuplicates: true },
    ]);
  });

  it("시도 통화 조회는 본인 발신만", async () => {
    const { sb, calls } = fakeSb({ data: { id: "s1", status: "ringing" } });
    expect(await findCallSessionByAttempt(sb, "u1", A)).toEqual({ id: "s1", status: "ringing" });
    expect(calls).toContainEqual(["eq", "initiator_user_id", "u1"]);
    expect(calls).toContainEqual(["eq", "client_attempt_id", A]);
    expect(await isCallAttemptCancelled(fakeSb({ data: null }).sb, "u1", A)).toBe(false);
    expect(await isCallAttemptCancelled(fakeSb({ data: { client_attempt_id: A } }).sb, "u1", A)).toBe(true);
  });

  it("취소 API 용은 조회 실패를 던지고, 생성 경로용은 기존 동작으로 진행", async () => {
    const broken = fakeSb({ error: { message: "db down" } }).sb;
    await expect(isCallAttemptCancelled(broken, "u1", A)).rejects.toThrow("call_attempt_cancel_lookup_failed");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await isCallAttemptCancelledForCreate(broken, "u1", A)).toBe(false);
    expect(await findCallSessionByAttemptForCreate(broken, "u1", A)).toBeNull();
    spy.mockRestore();
  });
});


/** 넘겨받기 순서 계약 — 옮긴 **뒤** 이전 시도·새 시도 취소 기록을 본다. */
function transferSb(opts: { previous: string | null; transferred: boolean; cancelled: string[] }) {
  const ops: string[] = [];
  return {
    ops,
    sb: {
      from(table: string) {
        const ctx: { table: string; op: string; eqs: Record<string, unknown> } = { table, op: "", eqs: {} };
        const chain: Record<string, unknown> = {
          select: () => ((ctx.op ||= "select"), chain),
          update: () => ((ctx.op = "update"), chain),
          eq: (k: string, v: unknown) => ((ctx.eqs[k] = v), chain),
          maybeSingle: async () => {
            if (table === "community_messenger_call_attempt_cancellations") {
              ops.push(`cancel_lookup:${String(ctx.eqs.client_attempt_id)}`);
              return { data: opts.cancelled.includes(String(ctx.eqs.client_attempt_id)) ? { x: 1 } : null };
            }
            if (ctx.op === "update") {
              ops.push(`update:status=${String(ctx.eqs.status)}`);
              return { data: opts.transferred ? { id: "s1" } : null };
            }
            ops.push("read_previous");
            return { data: { client_attempt_id: opts.previous } };
          },
        };
        return chain;
      },
    },
  };
}

describe("transferRingingSessionToAttempt", () => {
  const OLD = "11111111-1111-4111-8111-111111111111";
  const NEW = "22222222-2222-4222-8222-222222222222";

  it("넘겨받음 — 이전 시도 확인은 옮긴 뒤", async () => {
    const { sb, ops } = transferSb({ previous: OLD, transferred: true, cancelled: [] });
    expect(await transferRingingSessionToAttempt(sb, "u1", "s1", NEW)).toBe("transferred");
    expect(ops).toEqual(["read_previous", "update:status=ringing", `cancel_lookup:${OLD}`, `cancel_lookup:${NEW}`]);
  });

  it("울리는 중이 아니면 넘겨받지 않음", async () => {
    const { sb } = transferSb({ previous: OLD, transferred: false, cancelled: [] });
    expect(await transferRingingSessionToAttempt(sb, "u1", "s1", NEW)).toBe("not_transferred");
  });

  it("이전 시도가 취소됨 → 쓰지 않음", async () => {
    const { sb } = transferSb({ previous: OLD, transferred: true, cancelled: [OLD] });
    expect(await transferRingingSessionToAttempt(sb, "u1", "s1", NEW)).toBe("previous_attempt_cancelled");
  });

  it("새 시도가 이미 취소됨", async () => {
    const { sb } = transferSb({ previous: null, transferred: true, cancelled: [NEW] });
    expect(await transferRingingSessionToAttempt(sb, "u1", "s1", NEW)).toBe("new_attempt_cancelled");
  });
});
