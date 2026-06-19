"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CallControlStateStore,
  type CallControlStoreInitial,
  type CallControlToast,
} from "@/lib/community-messenger/call-control-state-store";
import type { CallAudioRouteApplyResult } from "@/lib/community-messenger/call-audio-route-controller";

export type {
  CallControlApplyState,
  CallControlToggleKey,
  CallControlsState,
  CallControlToast,
} from "@/lib/community-messenger/call-control-state-store";
export {
  CALL_CONTROL_FAIL_REVERT_MS,
  CALL_CONTROL_SINGLE_FLIGHT_MS,
  logCallControl,
} from "@/lib/community-messenger/call-control-state-store";

export type UseCallControlStateInitial = CallControlStoreInitial;

export type UseCallControlStateArgs = {
  initial?: UseCallControlStateInitial;
  onToast?: (toast: CallControlToast) => void;
};

export function useCallControlState(args: UseCallControlStateArgs = {}) {
  const { initial, onToast } = args;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  const storeRef = useRef<CallControlStateStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new CallControlStateStore(initial, (toast) => onToastRef.current?.(toast));
  }

  const store = storeRef.current;
  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot()
  );

  useEffect(() => () => store.dispose(), [store]);

  const speakerOnRef = useRef(snapshot.speakerOn);
  speakerOnRef.current = snapshot.speakerOn;
  const micMutedRef = useRef(snapshot.micMuted);
  micMutedRef.current = snapshot.micMuted;
  const cameraOffRef = useRef(snapshot.cameraOff);
  cameraOffRef.current = snapshot.cameraOff;

  const resetControls = useCallback(
    (next?: UseCallControlStateInitial) => {
      store.reset(next);
    },
    [store]
  );

  const reconcileSpeakerFromRoute = useCallback(
    (result: CallAudioRouteApplyResult) => {
      store.reconcileSpeakerFromRoute(result);
    },
    [store]
  );

  const setSpeakerConfirmed = useCallback(
    (on: boolean) => {
      store.setSpeakerConfirmed(on);
    },
    [store]
  );

  const toggleSpeaker = useCallback(
    (apply: (desiredSpeaker: boolean) => Promise<CallAudioRouteApplyResult>) => store.toggleSpeaker(apply),
    [store]
  );

  const toggleMic = useCallback(
    (apply: (nextMuted: boolean) => Promise<boolean>) => store.toggleMic(apply),
    [store]
  );

  const toggleCamera = useCallback(
    (apply: (nextOff: boolean) => Promise<boolean>) => store.toggleCamera(apply),
    [store]
  );

  const switchCamera = useCallback(
    (apply: () => Promise<boolean>) => store.switchCamera(apply),
    [store]
  );

  const beginEnd = useCallback(() => store.beginEnd(), [store]);
  const completeEnd = useCallback(() => store.completeEnd(), [store]);

  return {
    speakerOn: snapshot.speakerOn,
    micMuted: snapshot.micMuted,
    cameraOff: snapshot.cameraOff,
    speakerOnRef,
    micMutedRef,
    cameraOffRef,
    phases: snapshot.phases,
    speakerApplying: snapshot.speakerApplying,
    micApplying: snapshot.micApplying,
    cameraApplying: snapshot.cameraApplying,
    cameraSwitching: snapshot.cameraSwitching,
    ending: snapshot.ending,
    resetControls,
    reconcileSpeakerFromRoute,
    setSpeakerConfirmed,
    toggleSpeaker,
    toggleMic,
    toggleCamera,
    switchCamera,
    beginEnd,
    completeEnd,
  };
}
