import { NextResponse } from "next/server";
import { getVapidPublicKeyForServer } from "@/lib/push/web-push-config";

export const dynamic = "force-dynamic";

/**
 * 클라이언트 `pushManager.subscribe` 의 `applicationServerKey` 용 공개 키.
 * 공개 정보만 반환 (인증 불필요).
 */
export async function GET() {
  const publicKey = getVapidPublicKeyForServer();
  return NextResponse.json(
    { ok: true, publicKey, web_push_enabled: process.env.WEB_PUSH_ENABLED === "1" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
