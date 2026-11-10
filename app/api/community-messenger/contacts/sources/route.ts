import type { NextRequest } from "next/server";
import { isValidContactsInstallId } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  isContactsPlatform,
  listContactsSources,
  registerContactsSource,
} from "@/lib/community-messenger/contacts/contacts-service.server";
import {
  contactsError,
  contactsResultResponse,
  readContactsJsonBody,
  withContactsRoute,
} from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 동기화 중인 기기 목록 (`?install_id=` 로 이 기기 표시) */
export async function GET(req: NextRequest) {
  return withContactsRoute(req, { name: "sources", limit: 30 }, async ({ userId, sb }) => {
    const installId = req.nextUrl.searchParams.get("install_id");
    if (installId && !isValidContactsInstallId(installId)) return contactsError("invalid_install_id");
    return contactsResultResponse(await listContactsSources(sb, userId, installId || null), (v) => ({ sources: v }));
  });
}

/**
 * POST — 이 기기 출처 등록·재사용 + 사용 갱신 (앱 시작 시 하루 1회, SSOT v5 G-3).
 * body `{ installId, platform: "android" | "ios" }`
 */
export async function POST(req: NextRequest) {
  return withContactsRoute(req, { name: "source-register", limit: 10 }, async ({ userId, sb }) => {
    const body = (await readContactsJsonBody(req)) as Record<string, unknown> | undefined;
    if (!body || !isValidContactsInstallId(body.installId)) return contactsError("invalid_install_id");
    if (!isContactsPlatform(body.platform)) return contactsError("bad_request");
    return contactsResultResponse(await registerContactsSource(sb, userId, body.installId, body.platform), (v) => ({
      source: v,
    }));
  });
}
