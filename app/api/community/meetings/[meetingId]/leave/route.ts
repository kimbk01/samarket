import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getNeighborhoodDevSampleMeeting } from "@/lib/neighborhood/dev-sample-data";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (process.env.NODE_ENV !== "production") {
    getNeighborhoodDevSampleMeeting(id);
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        meetingMembers?: Map<string, Array<{ user_id: string; status: "joined" | "left" | "kicked" }>>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const members = state?.meetingMembers?.get(id);
    const target = members?.find((member) => member.user_id === auth.userId);
    if (target) {
      target.status = "left";
      return NextResponse.json({ ok: true, fallback: "dev_samples" });
    }
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { error } = await sb
    .from("meeting_members")
    .update({ status: "left", left_at: new Date().toISOString(), status_reason: "self_left" })
    .eq("meeting_id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
