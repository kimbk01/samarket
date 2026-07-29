import { afterEach, describe, expect, it, vi } from "vitest";
import { tryClaimIncomingCallPushDispatch } from "@/lib/community-messenger/incoming-call-push-claim";
import {
  dispatchIncomingCallVoipOnCriticalPath,
  resetIncomingCallVoipDispatchIdempotencyForTests,
  setIncomingCallVoipClaimForTests,
  setIncomingCallVoipPushSenderForTests,
} from "@/lib/community-messenger/incoming-call-voip-dispatch";

type Row = { id: string; incoming_push_claimed_at: string | null };

function createCasClient(store: Map<string, Row>) {
  return {
    from(_table: string) {
      let filterId: string | null = null;
      let requireNullClaim = false;
      let mode: "update" | "select" = "select";
      let patch: Partial<Row> = {};

      const builder: any = {
        update(values: Partial<Row>) {
          mode = "update";
          patch = values;
          return builder;
        },
        select(_cols?: string) {
          return builder;
        },
        eq(col: string, value: string) {
          if (col === "id") filterId = value;
          return builder;
        },
        is(col: string, value: null) {
          if (col === "incoming_push_claimed_at" && value === null) requireNullClaim = true;
          return builder;
        },
        async maybeSingle() {
          if (!filterId) return { data: null, error: null };
          const row = store.get(filterId);
          if (!row) return { data: null, error: null };

          if (mode === "update") {
            if (requireNullClaim && row.incoming_push_claimed_at != null) {
              return { data: null, error: null };
            }
            const next = {
              ...row,
              incoming_push_claimed_at:
                patch.incoming_push_claimed_at !== undefined
                  ? (patch.incoming_push_claimed_at as string | null)
                  : row.incoming_push_claimed_at,
            };
            store.set(filterId, next);
            return { data: { id: next.id, incoming_push_claimed_at: next.incoming_push_claimed_at }, error: null };
          }

          return {
            data: { id: row.id, incoming_push_claimed_at: row.incoming_push_claimed_at },
            error: null,
          };
        },
      };
      return builder;
    },
  } as any;
}

describe("tryClaimIncomingCallPushDispatch", () => {
  it("concurrent claim 100 times → winner 1 loser 99", async () => {
    const store = new Map<string, Row>([
      ["sess-cas-100", { id: "sess-cas-100", incoming_push_claimed_at: null }],
    ]);
    const svc = createCasClient(store);
    const results = await Promise.all(
      Array.from({ length: 100 }, () => tryClaimIncomingCallPushDispatch(svc, "sess-cas-100")),
    );
    const wins = results.filter((r) => r.claimed);
    const losses = results.filter((r) => !r.claimed && r.reason === "already_claimed");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(99);
    expect(store.get("sess-cas-100")?.incoming_push_claimed_at).toBeTruthy();
  });

  it("column-missing fail-open returns claimed true once path", async () => {
    const svc = {
      from() {
        return {
          update() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          select() {
            return this;
          },
          async maybeSingle() {
            return {
              data: null,
              error: { message: 'column "incoming_push_claimed_at" does not exist', code: "42703" },
            };
          },
        };
      },
    } as any;
    const result = await tryClaimIncomingCallPushDispatch(svc, "sess-missing-col");
    expect(result.claimed).toBe(true);
  });

  it("generic DB error does not fail-open", async () => {
    const svc = {
      from() {
        return {
          update() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          select() {
            return this;
          },
          async maybeSingle() {
            return { data: null, error: { message: "connection reset", code: "08006" } };
          },
        };
      },
    } as any;
    const result = await tryClaimIncomingCallPushDispatch(svc, "sess-db-err");
    expect(result).toEqual({ claimed: false, reason: "claim_failed" });
  });
});

describe("dispatchIncomingCallVoipOnCriticalPath + durable claim", () => {
  afterEach(() => {
    setIncomingCallVoipPushSenderForTests(null);
    resetIncomingCallVoipDispatchIdempotencyForTests();
  });

  it("100 concurrent dispatch with single-winner claim → push once", async () => {
    resetIncomingCallVoipDispatchIdempotencyForTests();
    const send = vi.fn().mockResolvedValue(undefined);
    setIncomingCallVoipPushSenderForTests(send);

    let claimed = false;
    setIncomingCallVoipClaimForTests(async () => {
      // Sync CAS — mirrors DB WHERE incoming_push_claimed_at IS NULL.
      if (claimed) return { claimed: false };
      claimed = true;
      return { claimed: true };
    });

    const input = {
      recipientUserId: "callee",
      sessionId: "sess-dispatch-100",
      roomId: "room-1",
      callerId: "caller",
      callKind: "voice" as const,
      startedAt: new Date().toISOString(),
    };

    const results = await Promise.all(
      Array.from({ length: 100 }, () => dispatchIncomingCallVoipOnCriticalPath(input)),
    );

    const started = results.filter((r) => r.started && !r.skippedDuplicate);
    const skipped = results.filter((r) => r.skippedDuplicate);
    expect(started).toHaveLength(1);
    expect(skipped).toHaveLength(99);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
