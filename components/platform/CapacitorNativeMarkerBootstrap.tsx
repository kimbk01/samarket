"use client";

import { useEffect } from "react";
import { ensureCapacitorNativeMarkerOnBoot } from "@/lib/platform/capacitor-native";

/**
 * Capacitor Android/iOS: server.url marker·getPlatform 기반 dibay_app eager persist.
 */
export function CapacitorNativeMarkerBootstrap() {
  useEffect(() => {
    ensureCapacitorNativeMarkerOnBoot();
  }, []);

  return null;
}
