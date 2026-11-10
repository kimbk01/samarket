import type { NextRequest } from "next/server";
import { parseContactsSyncRequest } from "@/lib/community-messenger/contacts/contacts-contract";
import { applyContactsSync } from "@/lib/community-messenger/contacts/contacts-service.server";
import {
  contactsError,
  contactsJson,
  contactsResultResponse,
  readContactsJsonBody,
  withContactsRoute,
} from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 연락처 올리기 (변경분 `delta` · 전체 스냅숏 조각 `snapshot_chunk`). 규약 SSOT v5 §7:
 * 중복 batchId = 같은 결과 · base 버전 다름 = 409 resync_required · 중지·삭제·권한 철회 = 410.
 * 번호는 E.164 로 받아 서버에서 바로 변환값으로 바꾸고 원 번호는 저장하지 않는다.
 */
export async function POST(req: NextRequest) {
  return withContactsRoute(req, { name: "sync", limit: 10 }, async ({ userId, sb, admin }) => {
    const parsed = parseContactsSyncRequest(await readContactsJsonBody(req), admin.requestNumberLimit);
    if (!parsed.ok) return contactsError(parsed.error);
    const r = await applyContactsSync(sb, userId, parsed.value);
    // §7: 동의 철회 뒤 업로드는 다른 중지와 같이 410 (다른 경로의 consent_required 는 403 유지)
    if (!r.ok && r.error === "consent_required") return contactsJson({ ok: false, error: r.error }, 410);
    return contactsResultResponse(r, (v) => ({ ...v }));
  });
}
