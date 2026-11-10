import type { NextRequest } from "next/server";
import { listContactsSuppressions } from "@/lib/community-messenger/contacts/contacts-service.server";
import { contactsResultResponse, withContactsRoute } from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 숨긴 추천 (추천에서 숨김 · 이전 친구). 누가 삭제했는지는 표시하지 않는다. */
export async function GET(req: NextRequest) {
  return withContactsRoute(req, { name: "suppressions", limit: 30 }, async ({ userId, sb }) =>
    contactsResultResponse(await listContactsSuppressions(sb, userId), (v) => ({ suppressions: v }))
  );
}
