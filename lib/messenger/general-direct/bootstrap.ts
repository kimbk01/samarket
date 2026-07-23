/**
 * general_direct BootstrapPort — accept-only. 운영 cutover 없음.
 * 타 Domain row 1건이라도 있으면 reject. partial 은 own snapshot 만 merge.
 */
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectListItem } from "@/lib/messenger/general-direct/types";
import { buildGeneralDirectListSnapshot } from "@/lib/messenger/general-direct/list";
import type { GeneralDirectRoomInput } from "@/lib/messenger/general-direct/types";

export type GeneralDirectBootstrapMode = "full" | "partial";

export type GeneralDirectBootstrapSnapshot = Readonly<{
  domain: typeof GENERAL_DIRECT_DOMAIN;
  viewerUserId: string;
  generation: string;
  mode: GeneralDirectBootstrapMode;
  rows: ReadonlyArray<GeneralDirectListItem>;
}>;

export type GeneralDirectBootstrapResult =
  | { ok: true; snapshot: GeneralDirectBootstrapSnapshot }
  | { ok: false; error: string };

export function acceptGeneralDirectBootstrap(input: {
  viewerUserId: string;
  generation: string;
  mode: GeneralDirectBootstrapMode;
  rooms: ReadonlyArray<GeneralDirectRoomInput>;
}): GeneralDirectBootstrapResult {
  const listed = buildGeneralDirectListSnapshot({
    viewerUserId: input.viewerUserId,
    generation: input.generation,
    rooms: input.rooms,
  });
  if (!listed.ok) return listed;
  return {
    ok: true,
    snapshot: {
      domain: GENERAL_DIRECT_DOMAIN,
      viewerUserId: listed.snapshot.viewerUserId,
      generation: listed.snapshot.generation,
      mode: input.mode,
      rows: listed.snapshot.rows,
    },
  };
}

/**
 * partial: 기존 general_direct snapshot 에 roomId upsert. 타 Domain/전체 wipe 금지.
 * generation 은 입력 generation 을 보존(호출자가 올림).
 */
export function mergeGeneralDirectPartialBootstrap(
  previous: GeneralDirectBootstrapSnapshot,
  patch: {
    generation: string;
    rooms: ReadonlyArray<GeneralDirectRoomInput>;
  }
): GeneralDirectBootstrapResult {
  if (previous.domain !== GENERAL_DIRECT_DOMAIN) {
    return { ok: false, error: "dibay_general_direct_bootstrap_domain_mismatch" };
  }
  const accepted = acceptGeneralDirectBootstrap({
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
      domain: GENERAL_DIRECT_DOMAIN,
      viewerUserId: previous.viewerUserId,
      generation: patch.generation,
      mode: "partial",
      rows: [...byId.values()],
    },
  };
}
