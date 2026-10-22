import { describe, expect, it } from "vitest";
import {
  isTerminalDismissCallPushKind,
  resolveCallPushKindForProviderPolicy,
  resolveCallPushProviderPolicy,
} from "@/lib/push/dispatch/push-payload-types";

describe("call push provider policy — iOS VoIP terminal safety (A1) · Jul 11 CallKit dismiss", () => {
  it("allows incoming_call over voip_apns", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "incoming_call",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: true });
  });

  it("blocks call_ended over voip_apns — connected iPhone ends via media (A1)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_ended",
        provider: "voip_apns",
        hasNativeCallTarget: true,
        targetDeviceId: "ios-a",
        voipTerminalExcludeDeviceIds: ["ios-b"],
      })
    ).toEqual({ allow: false, reason: "ios_voip_call_ended_media_owned" });
  });

  it("call_rejected over voip_apns only to devices other than the rejecting device (A1)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_rejected",
        provider: "voip_apns",
        hasNativeCallTarget: true,
        targetDeviceId: "ios-other",
        voipTerminalExcludeDeviceIds: ["ios-actor"],
      })
    ).toEqual({ allow: true });
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_rejected",
        provider: "voip_apns",
        hasNativeCallTarget: true,
        targetDeviceId: " ios-actor ",
        voipTerminalExcludeDeviceIds: ["ios-actor"],
      })
    ).toEqual({ allow: false, reason: "ios_voip_terminal_actor_or_answered_device" });
  });

  it("call_answered_elsewhere over voip_apns never reaches the answering device (A1)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_answered_elsewhere",
        provider: "voip_apns",
        hasNativeCallTarget: true,
        targetDeviceId: "ios-answered",
        voipTerminalExcludeDeviceIds: ["ios-answered"],
      })
    ).toEqual({ allow: false, reason: "ios_voip_terminal_actor_or_answered_device" });
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_answered_elsewhere",
        provider: "voip_apns",
        hasNativeCallTarget: true,
        targetDeviceId: "ios-ringing",
        voipTerminalExcludeDeviceIds: ["ios-answered"],
      })
    ).toEqual({ allow: true });
  });

  it("unknown actor/answered device or unknown target device → no VoIP terminal (A1 fail-safe)", () => {
    for (const kind of ["call_rejected", "call_answered_elsewhere"] as const) {
      for (const exclude of [undefined, null, [], [" "]]) {
        expect(
          resolveCallPushProviderPolicy({
            callPushKind: kind,
            provider: "voip_apns",
            hasNativeCallTarget: true,
            targetDeviceId: "ios-a",
            voipTerminalExcludeDeviceIds: exclude,
          })
        ).toEqual({ allow: false, reason: "ios_voip_terminal_actor_device_unknown" });
      }
      expect(
        resolveCallPushProviderPolicy({
          callPushKind: kind,
          provider: "voip_apns",
          hasNativeCallTarget: true,
          targetDeviceId: null,
          voipTerminalExcludeDeviceIds: ["ios-actor"],
        })
      ).toEqual({ allow: false, reason: "ios_voip_terminal_target_device_unknown" });
    }
  });

  it("allows call_canceled over voip_apns (PASS VoIP terminal restore)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_canceled",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: true });
  });

  it("keeps terminal dismiss on non-VoIP providers (apns/fcm/web_push)", () => {
    for (const kind of ["call_ended", "call_rejected", "call_canceled"] as const) {
      expect(
        resolveCallPushProviderPolicy({ callPushKind: kind, provider: "apns", hasNativeCallTarget: true }).allow
      ).toBe(true);
      expect(
        resolveCallPushProviderPolicy({ callPushKind: kind, provider: "fcm", hasNativeCallTarget: true }).allow
      ).toBe(true);
      // terminal dismiss must reach web too so stale incoming UI can close, even with native target present.
      expect(
        resolveCallPushProviderPolicy({ callPushKind: kind, provider: "web_push", hasNativeCallTarget: true }).allow
      ).toBe(true);
    }
  });

  it("keeps incoming web_push suppressed when a native call target exists (unchanged policy)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "incoming_call",
        provider: "web_push",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: false, reason: "native_call_preferred" });
  });

  it("delivers incoming web_push when no native call target exists (unchanged policy)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "incoming_call",
        provider: "web_push",
        hasNativeCallTarget: false,
      })
    ).toEqual({ allow: true });
  });

  it("blocks voip_apns when call_push_kind is absent (admin/notice must not ring CallKit)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: null,
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: false, reason: "voip_reserved_for_call_push" });
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: undefined,
        provider: "voip_apns",
        hasNativeCallTarget: false,
      })
    ).toEqual({ allow: false, reason: "voip_reserved_for_call_push" });
  });

  it("allows non-call web_push even when a voip/fcm device exists", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: null,
        provider: "web_push",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: true });
  });

  it("blocks missed_call over voip_apns — iPhone already ended by its own ring timer (A1)", () => {
    expect(isTerminalDismissCallPushKind("missed_call")).toBe(false);
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "missed_call",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: false, reason: "ios_voip_missed_call_local_ring_timeout" });
    // missed 알림(일반 apns·fcm)은 그대로.
    expect(
      resolveCallPushProviderPolicy({ callPushKind: "missed_call", provider: "apns", hasNativeCallTarget: true })
    ).toEqual({ allow: true });
    expect(
      resolveCallPushProviderPolicy({ callPushKind: "missed_call", provider: "fcm", hasNativeCallTarget: true })
    ).toEqual({ allow: true });
  });

  it("classifies terminal-dismiss kinds correctly", () => {
    expect(isTerminalDismissCallPushKind("call_ended")).toBe(true);
    expect(isTerminalDismissCallPushKind("call_rejected")).toBe(true);
    expect(isTerminalDismissCallPushKind("call_canceled")).toBe(true);
    expect(isTerminalDismissCallPushKind("incoming_call")).toBe(false);
    expect(isTerminalDismissCallPushKind("missed_call")).toBe(false);
    expect(isTerminalDismissCallPushKind(null)).toBe(false);
    expect(isTerminalDismissCallPushKind(undefined)).toBe(false);
  });

  it("resolves call kind for VoIP gate without inventing incoming_call for notice", () => {
    expect(
      resolveCallPushKindForProviderPolicy(
        {
          user_id: "u1",
          notification_type: "notice",
          title: "t",
          body: "b",
          link_url: "/",
          link_url_absolute: null,
          occurred_at: "",
        },
        undefined
      )
    ).toBeNull();
    expect(
      resolveCallPushKindForProviderPolicy(
        {
          user_id: "u1",
          notification_type: "community_messenger_incoming_call",
          title: "t",
          body: "b",
          link_url: "/",
          link_url_absolute: null,
          occurred_at: "",
        },
        undefined
      )
    ).toBe("incoming_call");
    expect(
      resolveCallPushKindForProviderPolicy(
        {
          user_id: "u1",
          notification_type: "notice",
          title: "t",
          body: "b",
          link_url: "/",
          link_url_absolute: null,
          occurred_at: "",
        },
        { call_push_kind: "incoming_call" }
      )
    ).toBe("incoming_call");
  });

  describe("A4 — iOS call alert suppressed where CallKit shows the call", () => {
    const voip = new Set(["ios-a"]);
    const kinds = [
      "incoming_call",
      "call_canceled",
      "call_rejected",
      "call_ended",
      "call_answered_elsewhere",
    ] as const;

    it("skips call alerts on an install with active voip_apns (incoming VoIP sent)", () => {
      for (const kind of kinds) {
        expect(
          resolveCallPushProviderPolicy({
            callPushKind: kind,
            provider: "apns",
            hasNativeCallTarget: true,
            targetDeviceId: " ios-a ",
            iosVoipDeviceIds: voip,
            iosVoipSentDeviceIds: new Set(["ios-a"]),
          })
        ).toEqual({ allow: false, reason: "ios_call_alert_callkit_owned" });
      }
    });

    it("falls back to the incoming alert when that install's VoIP was not sent", () => {
      expect(
        resolveCallPushProviderPolicy({
          callPushKind: "incoming_call",
          provider: "apns",
          hasNativeCallTarget: true,
          targetDeviceId: "ios-a",
          iosVoipDeviceIds: voip,
          iosVoipSentDeviceIds: new Set(),
        })
      ).toEqual({ allow: true });
      // terminal kinds stay suppressed even without VoIP (A1 skips most terminal VoIP).
      expect(
        resolveCallPushProviderPolicy({
          callPushKind: "call_ended",
          provider: "apns",
          hasNativeCallTarget: true,
          targetDeviceId: "ios-a",
          iosVoipDeviceIds: voip,
          iosVoipSentDeviceIds: new Set(),
        })
      ).toEqual({ allow: false, reason: "ios_call_alert_callkit_owned" });
    });

    it("keeps missed_call alert and alerts on installs without VoIP (iPad / old install)", () => {
      expect(
        resolveCallPushProviderPolicy({
          callPushKind: "missed_call",
          provider: "apns",
          hasNativeCallTarget: true,
          targetDeviceId: "ios-a",
          iosVoipDeviceIds: voip,
          iosVoipSentDeviceIds: voip,
        })
      ).toEqual({ allow: true });
      for (const kind of kinds) {
        expect(
          resolveCallPushProviderPolicy({
            callPushKind: kind,
            provider: "apns",
            hasNativeCallTarget: true,
            targetDeviceId: "ipad-no-voip",
            iosVoipDeviceIds: voip,
            iosVoipSentDeviceIds: voip,
          }).allow
        ).toBe(true);
      }
    });

    it("does not touch fcm / web_push / non-call alerts", () => {
      expect(
        resolveCallPushProviderPolicy({
          callPushKind: "incoming_call",
          provider: "fcm",
          hasNativeCallTarget: true,
          targetDeviceId: "ios-a",
          iosVoipDeviceIds: voip,
          iosVoipSentDeviceIds: voip,
        })
      ).toEqual({ allow: true });
      expect(
        resolveCallPushProviderPolicy({
          callPushKind: null,
          provider: "apns",
          hasNativeCallTarget: true,
          targetDeviceId: "ios-a",
          iosVoipDeviceIds: voip,
          iosVoipSentDeviceIds: voip,
        })
      ).toEqual({ allow: true });
    });
  });
});
