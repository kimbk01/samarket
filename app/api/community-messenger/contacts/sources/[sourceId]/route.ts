import type { NextRequest } from "next/server";
import { isUuid, isValidContactsInstallId } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  deleteContactsSource,
  isContactsPermissionState,
  patchContactsSource,
} from "@/lib/community-messenger/contacts/contacts-service.server";
import {
  contactsError,
  contactsResultResponse,
  readContactsJsonBody,
  withContactsRoute,
} from "@/lib/community-messenger/contacts/contacts-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sourceId: string }> };

/**
 * PATCH — 이 기기 상태 (이 기기에서만: installId 확인).
 * body `{ installId, syncEnabled?, permissionState?, revokeChoice?: "delete" | "keep" }` — revokeChoice 는 OS 권한 철회 안내 답 (#19)
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withContactsRoute(req, { name: "source-patch", limit: 20 }, async ({ userId, sb }) => {
    const { sourceId } = await params;
    if (!isUuid(sourceId)) return contactsError("bad_request");
    const body = (await readContactsJsonBody(req)) as Record<string, unknown> | undefined;
    if (!body || !isValidContactsInstallId(body.installId)) return contactsError("invalid_install_id");
    if (body.syncEnabled !== undefined && typeof body.syncEnabled !== "boolean") return contactsError("bad_request");
    if (body.permissionState !== undefined && !isContactsPermissionState(body.permissionState)) return contactsError("bad_request");
    if (body.revokeChoice !== undefined && body.revokeChoice !== "delete" && body.revokeChoice !== "keep") {
      return contactsError("bad_request");
    }
    const r = await patchContactsSource(sb, userId, sourceId, body.installId, {
      syncEnabled: body.syncEnabled as boolean | undefined,
      permissionState: body.permissionState as never,
      revokeChoice: body.revokeChoice as "delete" | "keep" | undefined,
    });
    return contactsResultResponse(r, (v) => ({ ...v }));
  });
}

/** DELETE — 그 기기 연락처 삭제 (다른 기기 목록에서도 가능 · 계정 소유만 확인) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withContactsRoute(req, { name: "source-delete", limit: 20 }, async ({ userId, sb }) => {
    const { sourceId } = await params;
    if (!isUuid(sourceId)) return contactsError("bad_request");
    return contactsResultResponse(await deleteContactsSource(sb, userId, sourceId), () => ({}));
  }, { allowWhenDisabled: true });
}
