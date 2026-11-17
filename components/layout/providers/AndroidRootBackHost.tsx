"use client";

import { useEffect } from "react";
import { startAndroidRootBackTracking } from "@/lib/ui/android-root-back";

/** D1 — Android 첫 화면 ◁ = 앱 내리기(기기 기본 뒤로). 화면 출력 없음. */
export function AndroidRootBackHost() {
  useEffect(() => startAndroidRootBackTracking(), []);
  return null;
}
