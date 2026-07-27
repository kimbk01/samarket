import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApnsAlertBody } from "@/lib/push/dispatch/apns-sender-impl";

const ROOT = path.resolve(__dirname, "../../../..");

function readSwift(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ios call terminal authority contracts", () => {
  it("keeps VoIP terminal blocked and APNs silent wake for cancel/reject/ended", () => {
    const policy = readFileSync(
      path.join(ROOT, "lib/push/dispatch/push-payload-types.ts"),
      "utf8"
    );
    expect(policy).toContain('"missed_call"');
    expect(policy).toContain("terminal_voip_disallowed");

    const cancelBody = buildApnsAlertBody({
      title: "통화",
      body: "",
      data: {
        call_push_kind: "call_canceled",
        sessionId: "sess-1",
      },
    });
    expect((cancelBody.aps as Record<string, unknown>)["content-available"]).toBe(1);
    expect((cancelBody.aps as Record<string, unknown>).alert).toBeUndefined();

    const missedBody = buildApnsAlertBody({
      title: "부재중 통화",
      body: "응답하지 않음",
      data: {
        call_push_kind: "missed_call",
        sessionId: "sess-2",
      },
    });
    expect((missedBody.aps as Record<string, unknown>)["content-available"]).toBe(1);
    expect((missedBody.aps as Record<string, unknown>).alert).toBeTruthy();
  });

  it("wires AppDelegate remote-fetch and Capacitor willPresent chain without orphan invent", () => {
    const appDelegate = readSwift("ios/App/App/AppDelegate.swift");
    expect(appDelegate).toContain("didReceiveRemoteNotification");
    expect(appDelegate).toContain("CallTerminalEventHandler.shared.handleIfTerminal");
    expect(appDelegate).toContain("apnsRemoteFetch");
    expect(appDelegate).toContain("apnsColdLaunch");

    const handler = readSwift("ios/App/App/Push/CallTerminalEventHandler.swift");
    expect(handler).toContain("ios_terminal_callkit_end_dispatch");
    expect(handler).toContain("endTrackedIncomingCallKitSession");
    expect(handler).not.toContain("reportOrphanTerminalVoipPushAndEnd");
    expect(handler).not.toContain("reportNewIncomingCall");

    const provider = readSwift("ios/App/App/Push/CallKitProvider.swift");
    expect(provider).toContain("trackedCallKitUuid");
    expect(provider).toContain("endTrackedIncomingCallKitSession");

    const bootstrap = readSwift("ios/App/App/Push/CallTerminalBootstrap.swift");
    expect(bootstrap).toContain("pushNotificationHandler");
    expect(bootstrap).toContain("DibayApnsTerminalNotificationHandler");

    const decision = readSwift("ios/App/App/Push/CallTerminalDecision.swift");
    expect(decision).toContain("outgoingGuard");
    expect(decision).toContain("registryMiss");
    expect(decision).toContain("unanswered");
    expect(decision).toContain("declinedElsewhere");
  });
});
