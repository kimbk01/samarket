import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { updateOpenGroupRoomSettings } from "@/lib/community-messenger/service";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await context.params;

  let body: {
    title?: string;
    summary?: string;
    password?: string;
    memberLimit?: number;
    isDiscoverable?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateOpenGroupRoomSettings({
    userId: auth.userId,
    roomId,
    title: typeof body.title === "string" ? body.title : undefined,
    summary: typeof body.summary === "string" ? body.summary : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    memberLimit: typeof body.memberLimit === "number" ? body.memberLimit : undefined,
    isDiscoverable: typeof body.isDiscoverable === "boolean" ? body.isDiscoverable : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
