/**
 * group BootstrapPort — group only. partial 은 group snapshot 만 merge.
 */
import { buildGroupListSnapshot } from "@/lib/messenger/group/list";
import { GROUP_DOMAIN, type GroupListItem, type GroupRoomInput } from "@/lib/messenger/group/types";

export type GroupBootstrapMode = "full" | "partial";

export type GroupBootstrapSnapshot = Readonly<{
  domain: typeof GROUP_DOMAIN;
  viewerUserId: string;
  generation: string;
  mode: GroupBootstrapMode;
  rows: ReadonlyArray<GroupListItem>;
}>;

export type GroupBootstrapResult =
  | { ok: true; snapshot: GroupBootstrapSnapshot }
  | { ok: false; error: string };

export function acceptGroupBootstrap(input: {
  viewerUserId: string;
  generation: string;
  mode: GroupBootstrapMode;
  rooms: ReadonlyArray<GroupRoomInput>;
}): GroupBootstrapResult {
  const listed = buildGroupListSnapshot({
    viewerUserId: input.viewerUserId,
    generation: input.generation,
    rooms: input.rooms,
  });
  if (!listed.ok) return listed;
  return {
    ok: true,
    snapshot: {
      domain: GROUP_DOMAIN,
      viewerUserId: listed.snapshot.viewerUserId,
      generation: listed.snapshot.generation,
      mode: input.mode,
      rows: listed.snapshot.rows,
    },
  };
}

export function mergeGroupPartialBootstrap(
  previous: GroupBootstrapSnapshot,
  patch: { generation: string; rooms: ReadonlyArray<GroupRoomInput> }
): GroupBootstrapResult {
  if (previous.domain !== GROUP_DOMAIN) {
    return { ok: false, error: "dibay_group_bootstrap_domain_mismatch" };
  }
  const accepted = acceptGroupBootstrap({
    viewerUserId: previous.viewerUserId,
    generation: patch.generation,
    mode: "partial",
    rooms: patch.rooms,
  });
  if (!accepted.ok) return accepted;
  const byId = new Map(previous.rows.map((r) => [r.roomId, r]));
  for (const row of accepted.snapshot.rows) {
    byId.set(row.roomId, { ...row, generation: patch.generation });
  }
  return {
    ok: true,
    snapshot: {
      domain: GROUP_DOMAIN,
      viewerUserId: previous.viewerUserId,
      generation: patch.generation,
      mode: "partial",
      rows: [...byId.values()],
    },
  };
}
