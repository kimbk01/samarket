import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { updateCommunityMessengerCallSession } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy accept entry — must carry the same device claim as
 * `PATCH /api/community-messenger/calls/sessions/[sessionId]` (`deviceId`).
 * Accept without deviceId leaves `answered_device_id` null and breaks
 * multi-device `answered_elsewhere` winner detection (Native teardown on same phone).
 * @see docs/dibay-call-multi-device-policy.md
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const { sessionId } = await params;
  let body: { deviceId?: string; answeredDeviceId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const answeredDeviceId =
    typeof body.answeredDeviceId === "string"
      ? body.answeredDeviceId
      : typeof body.deviceId === "string"
        ? body.deviceId
        : undefined;
  const result = await updateCommunityMessengerCallSession({
    userId: auth.userId,
    sessionId,
    action: "accept",
    answeredDeviceId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
