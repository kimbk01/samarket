"use client";

import { getCapacitorNativeDiagnostics } from "@/lib/platform/capacitor-native";

export type PushRegisterLogStep =
  | "mount"
  | "session_authenticated"
  | "permission_check"
  | "permission_request"
  | "register_call"
  | "registration_event"
  | "api_post"
  | "success";

const TAG = "DIBAY_PUSH_REGISTER";
const FAIL_TAG = "DIBAY_PUSH_REGISTER_FAIL";

function formatPayload(step: string, detail?: Record<string, unknown>): string {
  const base = detail ? { step, ...detail } : { step };
  try {
    return JSON.stringify(base);
  } catch {
    return `${step}`;
  }
}

/** Logcat — Android WebChromeClient 가 DIBAY_PUSH_REGISTER* 를 네이티브 태그로 재출력한다. */
export function logPushRegister(step: PushRegisterLogStep | string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const line = `[${TAG}] ${formatPayload(step, detail)}`;
  console.log(line);
}

export function logPushRegisterFail(reason: string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const line = `[${FAIL_TAG}] ${formatPayload(reason, detail)}`;
  console.error(line);
}

export function logPushRegisterMountContext(): void {
  logPushRegister("mount", {
    href: typeof window !== "undefined" ? window.location.href : null,
    ...getCapacitorNativeDiagnostics(),
  });
}
