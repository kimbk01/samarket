import type { NextRequest } from "next/server";
import {
  DIBAY_APP_MARKER_COOKIE_NAME,
  DIBAY_APP_MARKER_PARAM,
  type DibayAppPlatform,
} from "@/lib/platform/capacitor-native";

function normalizePlatform(value: string | null | undefined): DibayAppPlatform | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "android" || normalized === "ios") {
    return normalized;
  }
  return null;
}

export function readNativePlatformFromRequest(req: NextRequest): DibayAppPlatform | null {
  const fromQuery = normalizePlatform(req.nextUrl.searchParams.get(DIBAY_APP_MARKER_PARAM));
  if (fromQuery) return fromQuery;
  return normalizePlatform(req.cookies.get(DIBAY_APP_MARKER_COOKIE_NAME)?.value);
}

export function isNativeAppRequest(req: NextRequest): boolean {
  return readNativePlatformFromRequest(req) != null;
}
