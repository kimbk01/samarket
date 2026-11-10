import type { NextRequest } from "next/server";
import {
  getContactsUserSettings,
  parseContactsSettingsPatch,
  patchContactsUserSettings,
} from "@/lib/community-messenger/contacts/contacts-service.server";
import {
  contactsError,
  contactsResultResponse,
  readContactsJsonBody,
  withContactsRoute,
} from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 계정 설정 (동의·계정 전체 동기화·번호로 나를 찾기·가입 알림·기본 통화) */
export async function GET(req: NextRequest) {
  return withContactsRoute(
    req,
    { name: "settings", limit: 30 },
    async ({ userId, sb, admin, featureEnabled }) =>
      contactsResultResponse(await getContactsUserSettings(sb, userId, admin), (v) => ({
        settings: v,
        featureEnabled,
        requestNumberLimit: admin.requestNumberLimit,
      })),
    { allowWhenDisabled: true }
  );
}

/** PATCH — 계정 설정 변경 (동의한 회원만) */
export async function PATCH(req: NextRequest) {
  return withContactsRoute(req, { name: "settings-patch", limit: 20 }, async ({ userId, sb }) => {
    const patch = parseContactsSettingsPatch(await readContactsJsonBody(req));
    if (!patch) return contactsError("bad_request");
    return contactsResultResponse(await patchContactsUserSettings(sb, userId, patch), () => ({}));
  });
}
