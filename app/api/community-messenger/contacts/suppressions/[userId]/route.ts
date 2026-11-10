import type { NextRequest } from "next/server";
import { isUuid } from "@/lib/community-messenger/contacts/contacts-contract";
import { setContactsSuppression } from "@/lib/community-messenger/contacts/contacts-service.server";
import {
  contactsError,
  contactsResultResponse,
  withContactsRoute,
} from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ userId: string }> };

/** POST — 추천에서 숨기기 (모든 기기 · 상대 모름) */
export async function POST(req: NextRequest, { params }: Ctx) {
  return withContactsRoute(req, { name: "suppress", limit: 30 }, async ({ userId, sb }) => {
    const { userId: target } = await params;
    if (!isUuid(target)) return contactsError("bad_request");
    return contactsResultResponse(await setContactsSuppression(sb, userId, target, true), () => ({}));
  });
}

/** DELETE — 다시 보기 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withContactsRoute(req, { name: "unsuppress", limit: 30 }, async ({ userId, sb }) => {
    const { userId: target } = await params;
    if (!isUuid(target)) return contactsError("bad_request");
    return contactsResultResponse(await setContactsSuppression(sb, userId, target, false), () => ({}));
  });
}
