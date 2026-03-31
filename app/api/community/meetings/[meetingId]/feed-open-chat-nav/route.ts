import { NextResponse } from "next/server";
import { loadPhilifeMeetingHubData } from "@/lib/neighborhood/philife-meeting-hub-load";
import { resolveFeedMeetupOpenChatNavPlan } from "@/lib/neighborhood/resolve-feed-meetup-open-chat-nav";

type Ctx = { params: Promise<{ meetingId: string }> };

/** GET — `/philife` 피드 모임 카드에서 오픈채팅 진입 방식(이동 vs 팝업) */
export async function GET(_req: Request, ctx: Ctx) {
  const meetingId = (await ctx.params).meetingId?.trim() ?? "";
  if (!meetingId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const hub = await loadPhilifeMeetingHubData(meetingId);
  if (!hub) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const plan = resolveFeedMeetupOpenChatNavPlan(hub);
  return NextResponse.json({ ok: true, plan });
}
