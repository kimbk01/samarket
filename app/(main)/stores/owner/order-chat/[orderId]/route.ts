import { NextResponse } from "next/server";
import { resolveOwnerOrderChatEnsureDocument } from "@/lib/business/owner-order-chat-ensure-document";

export const dynamic = "force-dynamic";

/**
 * Owner hard-ensure — HTTP document redirect (307) to canonical Messenger Room.
 *
 * Must NOT use page.tsx `redirect()` (Server Component soft/RSC apply): Cap cold
 * intermittently fails AppRouter Room URL commit with React #310 while Room RSC
 * already returned 200.
 *
 * @see .tmp/messenger-page-nav-ssot/owner-ensure-cold/FD9_PASS_VS_FAIL_FIRST_DIVERGENCE_REPORT.md
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const result = await resolveOwnerOrderChatEnsureDocument(orderId);

  if (result.kind === "not_found") {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (result.kind === "html") {
    return new NextResponse(result.html, {
      status: result.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  }

  const location = new URL(result.locationPathAndSearch, request.url);
  const res = NextResponse.redirect(location, 307);
  res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return res;
}
