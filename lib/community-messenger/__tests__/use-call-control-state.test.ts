import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_CONTROL_SINGLE_FLIGHT_MS,
  CallControlStateStore,
  isSpeakerApplySuccess,
  logCallControl,
  speakerOnFromRoute,
} from "@/lib/community-messenger/call-control-state-store";

describe("call-control-state-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("optimistically toggles speaker on tap before async apply completes", async () => {
    let resolveApply!: (value: {
      requestedSpeaker: boolean;
      applied: boolean;
      actualRoute: "speaker";
      externalDeviceConnected: boolean;
      api: "setSpeakerphoneOn";
      reason: string;
    }) => void;
    const applyPromise = new Promise<{
      requestedSpeaker: boolean;
      applied: boolean;
      actualRoute: "speaker";
      externalDeviceConnected: boolean;
      api: "setSpeakerphoneOn";
      reason: string;
    }>((resolve) => {
      resolveApply = resolve;
    });

    const store = new CallControlStateStore({ speakerOn: false });
    void store.toggleSpeaker(() => applyPromise);

    expect(store.getSnapshot().speakerOn).toBe(true);
    expect(store.getSnapshot().speakerApplying).toBe(true);

    resolveApply({
      requestedSpeaker: true,
      applied: true,
      actualRoute: "speaker",
      externalDeviceConnected: false,
      api: "setSpeakerphoneOn",
      reason: "test",
    });
    await applyPromise;

    expect(store.getSnapshot().speakerOn).toBe(true);
    expect(store.getSnapshot().speakerApplying).toBe(false);
  });

  it("ignores rapid duplicate speaker taps during single-flight lock", async () => {
    const apply = vi.fn(
      () =>
        new Promise<{
          requestedSpeaker: boolean;
          applied: boolean;
          actualRoute: "speaker";
          externalDeviceConnected: boolean;
          api: "setSpeakerphoneOn";
          reason: string;
        }>((resolve) => {
          setTimeout(
            () =>
              resolve({
                requestedSpeaker: true,
                applied: true,
                actualRoute: "speaker",
                externalDeviceConnected: false,
                api: "setSpeakerphoneOn",
                reason: "test",
              }),
            50
          );
        })
    );

    const store = new CallControlStateStore({ speakerOn: false });
    void store.toggleSpeaker(apply);
    void store.toggleSpeaker(apply);
    void store.toggleSpeaker(apply);
    void store.toggleSpeaker(apply);
    void store.toggleSpeaker(apply);
    await vi.advanceTimersByTimeAsync(CALL_CONTROL_SINGLE_FLIGHT_MS + 60);

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("keeps mic UI aligned with track muted state after repeated toggles", async () => {
    let muted = false;
    const store = new CallControlStateStore({ micMuted: false });

    for (let i = 0; i < 6; i += 1) {
      await store.toggleMic(async (nextMuted) => {
        muted = nextMuted;
        return true;
      });
    }

    expect(store.getSnapshot().micMuted).toBe(muted);
    expect(store.getSnapshot().micMuted).toBe(true);
  });

  it("rolls back camera toggle when apply fails", async () => {
    const onToast = vi.fn();
    const store = new CallControlStateStore({ cameraOff: false }, onToast);

    await store.toggleCamera(async () => false);

    expect(store.getSnapshot().cameraOff).toBe(false);
    expect(onToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cm_ui_camera_toggle_failed" })
    );
  });

  it("preserves camera state when switch apply fails", async () => {
    const onToast = vi.fn();
    const store = new CallControlStateStore({ cameraOff: false }, onToast);

    await store.switchCamera(async () => false);

    expect(store.getSnapshot().cameraOff).toBe(false);
    expect(onToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cm_ui_camera_switch_failed" })
    );
  });

  it("allows end only once until completeEnd", () => {
    const store = new CallControlStateStore();
    expect(store.beginEnd()).toBe(true);
    expect(store.beginEnd()).toBe(false);
    expect(store.getSnapshot().ending).toBe(true);
    store.completeEnd();
    expect(console.info).toHaveBeenCalledWith("[call-control] end_done", {});
  });

  it("reverts speaker UI after native route apply failure", async () => {
    const onToast = vi.fn();
    const store = new CallControlStateStore({ speakerOn: false }, onToast);

    await store.toggleSpeaker(async () => ({
      requestedSpeaker: true,
      applied: false,
      actualRoute: "earpiece",
      externalDeviceConnected: false,
      api: "setSpeakerphoneOn",
      reason: "test",
    }));

    expect(store.getSnapshot().speakerOn).toBe(false);
    expect(onToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cm_ui_speaker_toggle_failed" })
    );
  });

  it("does not reconcile speaker route while applying", async () => {
    let resolveApply!: (value: {
      requestedSpeaker: boolean;
      applied: boolean;
      actualRoute: "speaker";
      externalDeviceConnected: boolean;
      api: "setSpeakerphoneOn";
      reason: string;
    }) => void;
    const applyPromise = new Promise<{
      requestedSpeaker: boolean;
      applied: boolean;
      actualRoute: "speaker";
      externalDeviceConnected: boolean;
      api: "setSpeakerphoneOn";
      reason: string;
    }>((resolve) => {
      resolveApply = resolve;
    });

    const store = new CallControlStateStore({ speakerOn: false });
    void store.toggleSpeaker(() => applyPromise);
    store.reconcileSpeakerFromRoute({
      requestedSpeaker: false,
      applied: true,
      actualRoute: "earpiece",
      externalDeviceConnected: false,
      api: "setSpeakerphoneOn",
      reason: "route_changed",
    });

    expect(store.getSnapshot().speakerOn).toBe(true);

    resolveApply({
      requestedSpeaker: true,
      applied: true,
      actualRoute: "speaker",
      externalDeviceConnected: false,
      api: "setSpeakerphoneOn",
      reason: "test",
    });
    await applyPromise;

    expect(store.getSnapshot().speakerOn).toBe(true);
  });

  it("treats bluetooth route as success when turning speaker off", () => {
    expect(
      isSpeakerApplySuccess(false, {
        requestedSpeaker: false,
        applied: true,
        actualRoute: "bluetooth",
        externalDeviceConnected: true,
        api: "setCommunicationDevice",
        reason: "test",
      })
    ).toBe(true);
    expect(
      speakerOnFromRoute({
        requestedSpeaker: false,
        applied: true,
        actualRoute: "bluetooth",
        externalDeviceConnected: true,
        api: "setCommunicationDevice",
        reason: "test",
      })
    ).toBe(false);
  });

  it("logs call-control events through helper", () => {
    logCallControl("speaker_toggle_success", { actualRoute: "speaker" });
    expect(console.info).toHaveBeenCalledWith("[call-control] speaker_toggle_success", {
      actualRoute: "speaker",
    });
  });
});
