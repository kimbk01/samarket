import { describe, expect, it } from "vitest";
import {
  isTerminalDismissCallPushKind,
  resolveCallPushKindForProviderPolicy,
  resolveCallPushProviderPolicy,
} from "@/lib/push/dispatch/push-payload-types";

describe("call push provider policy — Jul 11 CallKit dismiss PASS restore", () => {
  it("allows incoming_call over voip_apns", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "incoming_call",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: true });
  });

  it("allows call_ended over voip_apns (PASS VoIP terminal restore)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_ended",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: true });
  });

  it("allows call_rejected over voip_apns (PASS VoIP terminal restore)", () => {
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "call_rejected",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
    ).toEqual({ allow: true });
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

  it("leaves missed_call VoIP routing unchanged", () => {
    expect(isTerminalDismissCallPushKind("missed_call")).toBe(false);
    expect(
      resolveCallPushProviderPolicy({
        callPushKind: "missed_call",
        provider: "voip_apns",
        hasNativeCallTarget: true,
      })
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
});
