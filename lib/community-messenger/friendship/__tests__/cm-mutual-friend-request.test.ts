import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CM_ACCEPT_FRIEND_REQUEST_ATOMIC_MARKERS,
  parseCmAcceptFriendRequestRpc,
  parseCmCancelFriendRequestRpc,
  parseCmRejectFriendRequestRpc,
  parseCmSendFriendRequestRpc,
} from "@/lib/community-messenger/friendship/cm-mutual-friend-request";

describe("cm-mutual-friend-request parsers", () => {
  it("parses send pending ok + already_requested", () => {
    expect(
      parseCmSendFriendRequestRpc({
        ok: true,
        request_id: "r1",
        status: "pending",
        already_requested: true,
      })
    ).toEqual({ ok: true, requestId: "r1", status: "pending", alreadyRequested: true });
  });

  it("parses send blocked / incoming / already_friend errors", () => {
    expect(parseCmSendFriendRequestRpc({ ok: false, error: "blocked_target" })).toEqual({
      ok: false,
      error: "blocked_target",
      requestId: undefined,
    });
    expect(
      parseCmSendFriendRequestRpc({
        ok: false,
        error: "incoming_request_exists",
        request_id: "r2",
      })
    ).toEqual({ ok: false, error: "incoming_request_exists", requestId: "r2" });
    expect(parseCmSendFriendRequestRpc({ ok: false, error: "already_friend" }).ok).toBe(false);
  });

  it("parses accept idempotent and peer id", () => {
    expect(
      parseCmAcceptFriendRequestRpc({
        ok: true,
        request_id: "r1",
        status: "accepted",
        peer_user_id: "u-a",
        idempotent: true,
      })
    ).toEqual({
      ok: true,
      requestId: "r1",
      status: "accepted",
      peerUserId: "u-a",
      idempotent: true,
    });
  });

  it("parses reject / cancel", () => {
    expect(
      parseCmRejectFriendRequestRpc({ ok: true, request_id: "r1", status: "rejected" })
    ).toEqual({ ok: true, requestId: "r1", status: "rejected" });
    expect(parseCmCancelFriendRequestRpc({ ok: true, did_cancel: true, request_id: "r1" })).toEqual({
      ok: true,
      didCancel: true,
      requestId: "r1",
    });
  });

  it("migration SQL contains atomic accept markers (rollback via RAISE)", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "supabase/migrations/20261201120000_cm_mutual_friend_request_atomic.sql"),
      "utf8"
    );
    for (const marker of CM_ACCEPT_FRIEND_REQUEST_ATOMIC_MARKERS) {
      expect(sql).toContain(marker);
    }
    // Exception path must rethrow so both friend upserts roll back with the function txn
    const acceptFn = sql.slice(sql.indexOf("cm_accept_friend_request"));
    expect(acceptFn).toMatch(/EXCEPTION[\s\S]*RAISE;/);
  });
});
