/**
 * F1 (설계 2026-11-18 PR-1) — 서버 「알 수 없음」 판정: RPC 오류·rolledBack 비업무 오류·message_send_failed → message_send_unavailable(503).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MESSENGER_SEND_REJECTED_ERROR,
  isMessengerSendTransientRpcError,
  resolveMessengerSendRpcCallError,
  MESSENGER_SEND_BUSINESS_ERROR_CODES,
  MESSENGER_SEND_UNAVAILABLE_ERROR,
  isMessengerSendUnavailableError,
  resolveMessengerSendRpcPayloadError,
} from "@/lib/community-messenger/server/messenger-send-unavailable";

describe("resolveMessengerSendRpcPayloadError", () => {
  it("WHEN OTHERS(rolledBack) 의 SQLERRM(deadlock·lock timeout·직렬화 실패) → unavailable", () => {
    for (const err of [
      "deadlock detected",
      "canceling statement due to lock timeout",
      "could not serialize access due to concurrent update",
    ]) {
      expect(resolveMessengerSendRpcPayloadError({ ok: false, error: err, rolledBack: true })).toBe(
        MESSENGER_SEND_UNAVAILABLE_ERROR
      );
    }
  });

  it("업무 코드는 rolledBack 이어도 그대로(4xx) — unique_violation 등", () => {
    expect(resolveMessengerSendRpcPayloadError({ ok: false, error: "unique_violation", rolledBack: true })).toBe(
      "unique_violation"
    );
    for (const code of MESSENGER_SEND_BUSINESS_ERROR_CODES) {
      expect(resolveMessengerSendRpcPayloadError({ ok: false, error: code })).toBe(code);
      expect(isMessengerSendUnavailableError(code)).toBe(false);
    }
  });

  it("오류 없음·message_send_failed → unavailable", () => {
    expect(resolveMessengerSendRpcPayloadError({ ok: false })).toBe(MESSENGER_SEND_UNAVAILABLE_ERROR);
    expect(resolveMessengerSendRpcPayloadError({ ok: false, error: "message_send_failed" })).toBe(
      MESSENGER_SEND_UNAVAILABLE_ERROR
    );
    expect(isMessengerSendUnavailableError("message_send_failed")).toBe(true);
    expect(isMessengerSendUnavailableError(MESSENGER_SEND_UNAVAILABLE_ERROR)).toBe(true);
  });

  it("업무 거절 코드 목록이 설계 §F1 과 같다(21개)", () => {
    expect([...MESSENGER_SEND_BUSINESS_ERROR_CODES].sort()).toEqual(
      [
        "forbidden",
        "content_required",
        "room_not_found",
        "room_deleted",
        "room_blocked",
        "room_archived",
        "room_readonly",
        "store_order_chat_closed",
        "trade_chat_mode_locked",
        "trade_flow_not_chatting",
        "trade_sender_left",
        "trade_seller_closed",
        "reply_target_not_found",
        "reply_target_invalid",
        "unique_violation",
        "bad_args",
        "null_sender_forbidden",
        "domain_mismatch",
        "identity_mismatch",
        "not_member",
        "participant_left",
      ].sort()
    );
  });

  it("서비스: rpcErr·응답 없음·readmit 실패가 unavailable 로 간다(문장 오류 반환 없음)", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    const atomic = src.slice(
      src.indexOf("async function trySendCommunityMessengerTextAtomic("),
      src.indexOf("export async function findCommunityMessengerMessageByClientId(")
    );
    expect(atomic).not.toContain("String(rpcErr.message");
    expect(atomic).toMatch(/if \(rpcErr\) \{[\s\S]*?return \{ ok: false, error: resolveMessengerSendRpcCallError\(rpcErr\) \};/);
    expect(atomic).toContain("resolveMessengerSendRpcPayloadError(payload)");
    const send = src.slice(src.indexOf("export async function sendCommunityMessengerMessage("));
    expect(send).toContain("if (!readmit.ok) return { ok: false, error: MESSENGER_SEND_UNAVAILABLE_ERROR };");
  });
});

describe("PR-1 검토 #6 rpcErr 일시 오류만 503", () => {
  it.each([
    [{ code: "", message: "TypeError: fetch failed" }],
    [{ message: "network" }],
    [{ code: "40001" }],
    [{ code: "40P01" }],
    [{ code: "55P03" }],
    [{ code: "57014" }],
    [{ code: "08006" }],
    [{ code: "08P01" }],
    [{ code: "53300" }],
    [{ code: "57P01" }],
    [{ code: "57P03" }],
    [{ code: "PGRST000" }],
    [{ code: "PGRST003" }],
  ])("일시 %o → unavailable(503)", (err) => {
    expect(isMessengerSendTransientRpcError(err)).toBe(true);
    expect(resolveMessengerSendRpcCallError(err)).toBe(MESSENGER_SEND_UNAVAILABLE_ERROR);
  });

  it.each([[{ code: "42501" }], [{ code: "23503" }], [{ code: "23514" }], [{ code: "22001" }], [{ code: "PGRST301" }], [{ code: "57P04" }]])(
    "비일시 %o → message_send_rejected(400)",
    (err) => {
      expect(isMessengerSendTransientRpcError(err)).toBe(false);
      expect(resolveMessengerSendRpcCallError(err)).toBe(MESSENGER_SEND_REJECTED_ERROR);
      expect(isMessengerSendUnavailableError(MESSENGER_SEND_REJECTED_ERROR)).toBe(false);
    }
  );
});
