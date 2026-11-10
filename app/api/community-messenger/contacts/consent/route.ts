import type { NextRequest } from "next/server";
import { consentContacts, withdrawContactsConsent } from "@/lib/community-messenger/contacts/contacts-service.server";
import { contactsResultResponse, withContactsRoute } from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — 연락처 기능 동의 (기존·신규 회원 공통). 동의한 순간 내 인증 번호를 등록한다 (정책 #2). */
export async function POST(req: NextRequest) {
  return withContactsRoute(req, { name: "consent", limit: 10 }, async ({ userId, sb, admin }) =>
    contactsResultResponse(await consentContacts(sb, userId, admin.consentVersion), (v) => ({ ...v }))
  );
}

/** DELETE — 동의 철회: 올린 연락처·번호 등록 삭제 (동의 기록은 남김) */
export async function DELETE(req: NextRequest) {
  return withContactsRoute(req, { name: "consent-withdraw", limit: 10 }, async ({ userId, sb }) =>
    contactsResultResponse(await withdrawContactsConsent(sb, userId), (v) => ({ ...v }))
  );
}
