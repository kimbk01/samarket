import { after, type NextRequest } from "next/server";
import { consentContacts, withdrawContactsConsent } from "@/lib/community-messenger/contacts/contacts-service.server";
import { sendContactJoinNotices } from "@/lib/community-messenger/contacts/contacts-join-notice.server";
import { contactsResultResponse, withContactsRoute } from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 연락처 기능 동의 (기존·신규 회원 공통). 동의한 순간 내 인증 번호를 등록한다 (정책 #2).
 * 신규 가입 회원(가입 7일 안 · 처음 등록)이면 응답 뒤에 가입 안내 1회 발송 (정책 #3 · SSOT v5 §4 S8).
 */
export async function POST(req: NextRequest) {
  return withContactsRoute(req, { name: "consent", limit: 10 }, async ({ userId, sb, admin }) => {
    const r = await consentContacts(sb, userId, admin.consentVersion);
    if (r.ok && r.value.joinNoticeEligible && admin.joinNoticeEnabled) {
      after(async () => {
        const out = await sendContactJoinNotices(sb, userId, admin).catch((e: unknown) => {
          console.error("[contacts] join notice", e);
          return null;
        });
        if (out) console.info("[contacts] join notice", { sent: out.sent, skipped: out.skipped });
      });
    }
    return contactsResultResponse(r, (v) => ({ ...v }));
  });
}

/** DELETE — 동의 철회: 올린 연락처·번호 등록 삭제 (동의 기록은 남김) */
export async function DELETE(req: NextRequest) {
  return withContactsRoute(req, { name: "consent-withdraw", limit: 10 }, async ({ userId, sb }) =>
    contactsResultResponse(await withdrawContactsConsent(sb, userId), (v) => ({ ...v })),
    { allowWhenDisabled: true }
  );
}
