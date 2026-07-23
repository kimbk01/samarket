/**
 * group ListPort — group 방만 · 그룹당 1행. peer로 title 생성 금지.
 */
import { buildGroupIdentity, parseGroupIdentityKey } from "@/lib/messenger/group/identity";
import {
  GROUP_DOMAIN,
  GROUP_NAME_PLACEHOLDER,
  type GroupListItem,
  type GroupListSnapshot,
  type GroupRoomInput,
  type GroupSubtype,
} from "@/lib/messenger/group/types";

export type GroupListPortResult =
  | { ok: true; snapshot: GroupListSnapshot }
  | { ok: false; error: string };

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseSubtype(raw: string | null | undefined): GroupSubtype | null {
  const s = trimOrEmpty(raw);
  if (s === "private_group" || s === "open_group") return s;
  return null;
}

function rejectForeignOrInvalid(row: GroupRoomInput): string | null {
  const domain = trimOrEmpty(row.chatDomain);
  const identityKey = trimOrEmpty(row.domainIdentityKey);
  if (!domain) return "dibay_group_domain_missing";
  if (domain === "general_direct" || domain === "trade" || domain === "store_order") {
    return `dibay_group_rejects_${domain}`;
  }
  if (domain !== GROUP_DOMAIN) return "dibay_group_domain_mismatch";
  if (!identityKey) return "dibay_group_identity_missing";
  try {
    parseGroupIdentityKey(identityKey);
  } catch (e) {
    return e instanceof Error ? e.message : "dibay_group_identity_invalid";
  }
  if (!trimOrEmpty(row.roomId)) return "dibay_group_room_id_required";
  if (!trimOrEmpty(row.groupId)) return "dibay_group_group_id_required";
  // LOCK router: group identityKey must equal group:{roomId}
  if (trimOrEmpty(row.groupId) !== trimOrEmpty(row.roomId)) {
    return "dibay_group_room_id_must_equal_group_id";
  }
  const expected = buildGroupIdentity(trimOrEmpty(row.groupId)).identityKey;
  if (identityKey !== expected) return "dibay_group_identity_group_mismatch";
  if (!parseSubtype(row.groupSubtype)) return "dibay_group_subtype_required";
  if (trimOrEmpty(row.peerDisplayName) || trimOrEmpty(row.peerAvatarUrl)) {
    return "dibay_group_peer_fields_forbidden_in_list";
  }
  return null;
}

export function mapGroupListItem(row: GroupRoomInput, generation: string): GroupListItem {
  const err = rejectForeignOrInvalid(row);
  if (err) throw new Error(err);
  const subtype = parseSubtype(row.groupSubtype)!;
  const lastAt = trimOrEmpty(row.lastMessageAt) || trimOrEmpty(row.updatedAt) || "";
  return {
    roomId: trimOrEmpty(row.roomId),
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: trimOrEmpty(row.domainIdentityKey),
    groupId: trimOrEmpty(row.groupId),
    groupSubtype: subtype,
    groupName: trimOrEmpty(row.groupName) || GROUP_NAME_PLACEHOLDER,
    groupImageUrl: trimOrEmpty(row.groupImageUrl) || null,
    memberCount: Math.max(0, Math.floor(Number(row.memberCount) || 0)),
    lastMessage: trimOrEmpty(row.lastMessage),
    lastMessageAt: lastAt,
    unreadCount: Math.max(0, Math.floor(Number(row.unreadCount) || 0)),
    updatedAt: trimOrEmpty(row.updatedAt) || lastAt,
    generation,
  };
}

export function buildGroupListSnapshot(input: {
  viewerUserId: string;
  generation: string;
  rooms: ReadonlyArray<GroupRoomInput>;
}): GroupListPortResult {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) return { ok: false, error: "dibay_group_viewer_required" };
  const generation = input.generation.trim() || "0";
  const seenIdentity = new Map<string, string>();
  const rows: GroupListItem[] = [];

  for (const room of input.rooms) {
    const foreign = rejectForeignOrInvalid(room);
    if (foreign) return { ok: false, error: foreign };
    let item: GroupListItem;
    try {
      item = mapGroupListItem(room, generation);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "dibay_group_list_map_failed" };
    }
    const prev = seenIdentity.get(item.domainIdentityKey);
    if (prev && prev !== item.roomId) {
      return { ok: false, error: `dibay_group_duplicate_identity:${item.domainIdentityKey}` };
    }
    seenIdentity.set(item.domainIdentityKey, item.roomId);
    rows.push(item);
  }

  return {
    ok: true,
    snapshot: { domain: GROUP_DOMAIN, viewerUserId, generation, rows },
  };
}
