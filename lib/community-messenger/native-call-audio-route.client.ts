"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type DibayCallAudioRouteKind = "speaker" | "earpiece" | "wired" | "bluetooth" | "unknown";

export type DibayCallAudioRouteApi =
  | "setCommunicationDevice"
  | "setSpeakerphoneOn"
  | "agora"
  | "noop";

export type DibayCallAudioRouteResult = {
  requestedSpeaker: boolean;
  applied: boolean;
  actualRoute: DibayCallAudioRouteKind;
  externalDeviceConnected: boolean;
  api: DibayCallAudioRouteApi;
  reason: string;
};

export type DibayCallAudioRoutesResult = DibayCallAudioRouteResult & {
  availableRoutes: DibayCallAudioRouteKind[];
};

type NativeRouteChangedEvent = {
  result?: DibayCallAudioRouteResult;
};

type DibayCallAudioRoutePlugin = {
  getCurrentRoute(): Promise<DibayCallAudioRouteResult>;
  getAvailableRoutes(): Promise<DibayCallAudioRoutesResult>;
  setSpeakerphoneEnabled(options: {
    enabled: boolean;
    reason: string;
    callType?: "audio" | "video";
  }): Promise<DibayCallAudioRouteResult>;
  release(options?: { reason?: string }): Promise<DibayCallAudioRouteResult>;
  addListener(
    eventName: "routeChanged",
    listenerFunc: (event: NativeRouteChangedEvent) => void
  ): Promise<PluginListenerHandle>;
};

export const DIBAY_CALL_AUDIO_ROUTE_PLUGIN_ID = "DibayCallAudioRoute";

const NativeCallAudioRoute = registerPlugin<DibayCallAudioRoutePlugin>(
  DIBAY_CALL_AUDIO_ROUTE_PLUGIN_ID
);

const FALLBACK_ROUTE_RESULT: DibayCallAudioRouteResult = {
  requestedSpeaker: false,
  applied: false,
  actualRoute: "unknown",
  externalDeviceConnected: false,
  api: "noop",
  reason: "native_unavailable",
};

function canUseNativeAudioRoute(): boolean {
  return isCapacitorNativePlatform();
}

export async function getNativeCallAudioRoute(): Promise<DibayCallAudioRouteResult> {
  if (!canUseNativeAudioRoute()) return FALLBACK_ROUTE_RESULT;
  try {
    return await NativeCallAudioRoute.getCurrentRoute();
  } catch (error) {
    console.warn("[call-audio-route] native_get_route_failed", error);
    return FALLBACK_ROUTE_RESULT;
  }
}

export async function setNativeCallSpeakerphoneEnabled(
  enabled: boolean,
  reason: string,
  callType?: "audio" | "video"
): Promise<DibayCallAudioRouteResult> {
  if (!canUseNativeAudioRoute()) {
    return { ...FALLBACK_ROUTE_RESULT, requestedSpeaker: enabled, reason };
  }
  try {
    return await NativeCallAudioRoute.setSpeakerphoneEnabled({ enabled, reason, callType });
  } catch (error) {
    console.warn("[call-audio-route] native_set_route_failed", { enabled, reason, error });
    return {
      ...FALLBACK_ROUTE_RESULT,
      requestedSpeaker: enabled,
      reason: "native_set_failed",
    };
  }
}

export async function releaseNativeCallAudioRoute(reason = "call_end"): Promise<void> {
  if (!canUseNativeAudioRoute()) return;
  try {
    await NativeCallAudioRoute.release({ reason });
  } catch (error) {
    console.warn("[call-audio-route] native_release_failed", { reason, error });
  }
}

export function subscribeNativeCallAudioRouteChanged(
  onChange: (result: DibayCallAudioRouteResult) => void
): () => void {
  if (!canUseNativeAudioRoute()) return () => {};
  let active = true;
  let handle: PluginListenerHandle | null = null;
  void NativeCallAudioRoute.addListener("routeChanged", (event) => {
    if (!active || !event.result) return;
    onChange(event.result);
  })
    .then((next) => {
      if (!active) {
        void next.remove();
        return;
      }
      handle = next;
    })
    .catch((error) => {
      console.warn("[call-audio-route] native_route_listener_failed", error);
    });
  return () => {
    active = false;
    if (handle) void handle.remove();
  };
}
