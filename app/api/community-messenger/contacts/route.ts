import type { NextRequest } from "next/server";
import { isUuid } from "@/lib/community-messenger/contacts/contacts-contract";
import { deleteAllContacts, listContacts } from "@/lib/community-messenger/contacts/contacts-service.server";
import {
  contactsError,
  contactsResultResponse,
  withContactsRoute,
} from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 내 연락처의 DIBAY 회원 (계정 기준). `?v=` 토큰이 같으면 notModified (데이터 0).
 * 친구 탭이 보일 때만 호출 — bootstrap·home-sync·Realtime·방 진입에서 부르지 않는다 (SSOT v5 §7).
 */
export async function GET(req: NextRequest) {
  return withContactsRoute(req, { name: "list", limit: 30 }, async ({ userId, sb }) => {
    const sp = req.nextUrl.searchParams;
    const sourceRaw = sp.get("source_id");
    if (sourceRaw && !isUuid(sourceRaw)) return contactsError("bad_request");
    const token = sp.get("v");
    const r = await listContacts(sb, userId, sourceRaw || null, token && token.length <= 64 ? token : null);
    return contactsResultResponse(r, (v) => ({ ...v }));
  });
}

/** DELETE — 계정 전체 연락처 삭제 (모든 기기 · 친구·숨김·차단·숨긴 추천 유지) */
export async function DELETE(req: NextRequest) {
  return withContactsRoute(req, { name: "delete-all", limit: 10 }, async ({ userId, sb }) =>
    contactsResultResponse(await deleteAllContacts(sb, userId), (v) => ({ ...v })),
    { allowWhenDisabled: true }
  );
}
