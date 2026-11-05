import { NextResponse, type NextRequest } from "next/server";
import {
  DIBAY_SHELL_HEADER,
  IOS_DIGITAL_PURCHASE_UNAVAILABLE,
  detectIosAppRequestSignals,
} from "@/lib/apple-iap/ios-digital-purchase-contract";
import { DIBAY_APP_MARKER_COOKIE_NAME } from "@/lib/auth/oauth/resolve-native-oauth-request.server";

function readMarkerCookie(req: NextRequest): string | null {
  const fromJar = req.cookies?.get?.(DIBAY_APP_MARKER_COOKIE_NAME)?.value;
  if (fromJar != null) return fromJar;
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DIBAY_APP_MARKER_COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** iOS 앱에서 온 Cash 결제 요청이면 403 — 인증·소유 검사 뒤, 쓰기 전에 호출한다. */
export function blockIosAppDigitalPurchase(req: NextRequest): NextResponse | null {
  const signals = detectIosAppRequestSignals({
    shellHeader: req.headers.get(DIBAY_SHELL_HEADER),
    markerCookie: readMarkerCookie(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!signals.length) return null;
  return NextResponse.json({ ok: false, error: IOS_DIGITAL_PURCHASE_UNAVAILABLE }, { status: 403 });
}
