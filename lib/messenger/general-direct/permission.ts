/**
 * general_direct PermissionPort — 서버 권위 계약 (Phase 2).
 * 실제 HTTP route 배포는 별도 승인. viewer participant 확인은 fail-closed.
 */
import type { MessengerPermissionPort } from "@/lib/messenger/contracts/ports";
import { assertGeneralDirectOwnedRoom } from "@/lib/messenger/general-direct/identity";
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectRoomInput } from "@/lib/messenger/general-direct/types";

export type GeneralDirectPermissionContext = Readonly<{
  viewerUserId: string;
  room: {
    roomId: string;
    chatDomain: string | null | undefined;
    domainIdentityKey: string | null | undefined;
    participantUserIds: ReadonlyArray<string>;
  };
}>;

/**
 * 서버/query 어댑터가 호출하는 순수 permission 검사.
 * roomType/direct_key 로 Domain 재판정하지 않음.
 */
export function assertGeneralDirectViewerPermission(ctx: GeneralDirectPermissionContext): void {
  const viewer = ctx.viewerUserId.trim();
  if (!viewer) throw new Error("dibay_general_direct_viewer_required");
  assertGeneralDirectOwnedRoom({
    roomId: ctx.room.roomId,
    chatDomain: (ctx.room.chatDomain ?? "") as "general_direct",
    domainIdentityKey: ctx.room.domainIdentityKey ?? "",
  });
  const participants = ctx.room.participantUserIds.map((id) => id.trim()).filter(Boolean);
  if (!participants.includes(viewer)) {
    throw new Error("dibay_general_direct_viewer_not_participant");
  }
}

/** 운영 API 계획 (route 미생성) — Phase 2 문서화용 */
export type GeneralDirectListApiPlan = Readonly<{
  method: "GET";
  /** 배포는 별도 승인 */
  proposedPath: "/api/messenger/general/list";
  query: { viewerUserId: "from session" };
  response: { domain: typeof GENERAL_DIRECT_DOMAIN; generation: string; rows: "GeneralDirectListItem[]" };
  serverFilters: ReadonlyArray<
    "chat_domain = general_direct" | "viewer is participant" | "reject other domains"
  >;
}>;

export const GENERAL_DIRECT_LIST_API_PLAN: GeneralDirectListApiPlan = {
  method: "GET",
  proposedPath: "/api/messenger/general/list",
  query: { viewerUserId: "from session" },
  response: { domain: GENERAL_DIRECT_DOMAIN, generation: "string", rows: "GeneralDirectListItem[]" },
  serverFilters: ["chat_domain = general_direct", "viewer is participant", "reject other domains"],
};

export function isGeneralDirectRoomCandidate(row: GeneralDirectRoomInput): boolean {
  return row.chatDomain === GENERAL_DIRECT_DOMAIN;
}

export const generalDirectPermissionPort: MessengerPermissionPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  serverAuthoritative: true,
};
