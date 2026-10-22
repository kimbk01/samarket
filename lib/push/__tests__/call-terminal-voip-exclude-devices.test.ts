import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchPushForUser = vi.fn(async () => ({ ok: true, targets_found: 0, deliveries: [] }));

vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...(args as [])),
}));
vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://example.test" }));

import { sendWebPushForCommunityMessengerCallAnsweredElsewhere } from "@/lib/push/send-community-messenger-call-answered-elsewhere-push";
import { sendWebPushForCommunityMessengerCallTerminal } from "@/lib/push/send-community-messenger-call-canceled-push";

function lastOpts(): Record<string, unknown> {
  const call = dispatchPushForUser.mock.calls.at(-1) as unknown as [unknown, Record<string, unknown>];
  return call[1];
}

/** A1 (docs/audit/messenger-2026-10-22-reaudit-plan.md §4-3): 종료 VoIP 제외 기기 전달 계약. */
describe("call terminal push — iOS VoIP exclude devices (A1)", () => {
  beforeEach(() => dispatchPushForUser.mockClear());

  it("rejected with actor device → excludes the rejecting device", async () => {
    await sendWebPushForCommunityMessengerCallTerminal({
      recipientUserId: "callee",
      sessionId: "s1",
      status: "rejected",
      actorDeviceId: " dev-actor ",
    });
    expect(lastOpts()).toMatchObject({
      call_push_kind: "call_rejected",
      ios_voip_terminal_exclude_device_ids: ["dev-actor"],
    });
  });

  it("rejected without actor device → no exclude list (policy then sends no VoIP)", async () => {
    await sendWebPushForCommunityMessengerCallTerminal({
      recipientUserId: "caller",
      sessionId: "s1",
      status: "rejected",
    });
    expect(lastOpts().ios_voip_terminal_exclude_device_ids).toBeUndefined();
  });

  it("cancelled keeps the existing all-device dismiss options", async () => {
    await sendWebPushForCommunityMessengerCallTerminal({
      recipientUserId: "callee",
      sessionId: "s1",
      status: "cancelled",
    });
    expect(lastOpts()).toMatchObject({ call_push_kind: "call_canceled", skip_settings_gate: true });
    expect(lastOpts().ios_voip_terminal_exclude_device_ids).toBeUndefined();
  });

  it("answered elsewhere → excludes the answering device", async () => {
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({
      recipientUserId: "callee",
      sessionId: "s1",
      answeredDeviceId: "dev-answered",
    });
    expect(lastOpts()).toMatchObject({
      call_push_kind: "call_answered_elsewhere",
      ios_voip_terminal_exclude_device_ids: ["dev-answered"],
    });
  });

  it("answered elsewhere without device → no exclude list", async () => {
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({
      recipientUserId: "callee",
      sessionId: "s1",
      answeredDeviceId: null,
    });
    expect(lastOpts().ios_voip_terminal_exclude_device_ids).toBeUndefined();
  });
});
