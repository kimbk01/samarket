/**
 * Room bootstrap cold fill — server·client 단계 분해 (관측 전용, response shape 불변).
 */
import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";

export type BootstrapSnapshotTier = "critical" | "full" | "fast" | "silent_delta";

export type BootstrapColdFillDeepBreakdown = {
  route_total_ms: number;
  auth_ms: number;
  canonical_ms: number;
  cache_lookup_ms: number;
  rpc_ms: number;
  rpc_payload_bytes: number;
  snapshot_deserialize_ms: number;
  payload_build_ms: number;
  json_serialize_ms: number;
  response_bytes: number;
  transport_slack_ms: number;
  client_fetch_ms: number | null;
  client_json_parse_ms: number | null;
  client_apply_ms: number | null;
  client_render_ready_ms: number | null;
  first_message_visible_ms: number | null;
  snapshotTier: BootstrapSnapshotTier;
  cmReqSrc: string;
  cmReqSrcRaw: string;
  cache_hit: 0 | 1;
  room_id_short: string;
  snapshot_via: string | null;
  silent_delta_fallback: 0 | 1;
  counter_upsert_ms?: number;
};

type BootstrapColdFillServerPartial = Pick<
  BootstrapColdFillDeepBreakdown,
  "rpc_ms" | "rpc_payload_bytes" | "snapshot_deserialize_ms" | "snapshot_via"
> & { counter_upsert_ms?: number };

let lastServerPartial: BootstrapColdFillServerPartial | null = null;

export function measureJsonUtf8Bytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

export function setLastBootstrapColdFillServerPartial(partial: BootstrapColdFillServerPartial): void {
  lastServerPartial = partial;
}

export function peekLastBootstrapColdFillServerPartial(): BootstrapColdFillServerPartial | null {
  return lastServerPartial;
}

/** 제품 보고용 — room_client_block→room_open, list_prefetch→prefetch 등 */
export function normalizeBootstrapCmReqSrcBucket(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "unknown";
  if (
    v === "room_client_block" ||
    v === "room_client" ||
    v === "room_client_legacy" ||
    v === "room_client_primed_followup"
  ) {
    return "room_open";
  }
  if (v === "room_silent") return "room_silent";
  if (v === "list_prefetch") return "prefetch";
  if (v.includes("reenter") || v === "room_reenter") return "reenter";
  return v;
}

export function roomIdShortForBootstrap(roomId: string): string {
  const s = roomId.trim();
  if (!s) return "";
  return s.length <= 8 ? s : s.slice(-8);
}

export function logBootstrapColdFillDeepBreakdown(entry: BootstrapColdFillDeepBreakdown): void {
  // eslint-disable-next-line no-console -- room bootstrap cold fill breakdown
  console.info("[bootstrap-cold-fill-deep-breakdown]", entry);
}

export function logRoomBootstrapRouteColdFillDeepBreakdown(input: {
  handlerT0: number;
  auth_ms: number;
  canonical_ms: number;
  cache_lookup_ms: number;
  snap_ms: number;
  payload_build_ms: number;
  cache_hit: boolean;
  snapshotTier: BootstrapSnapshotTier;
  cmReqSrcRaw: string | null | undefined;
  roomId: string;
  diagnostics: CommunityMessengerRoomSnapshotDiagnostics;
  body: Record<string, unknown>;
  silent_delta_fallback?: boolean;
}): void {
  const serverPartial = peekLastBootstrapColdFillServerPartial();
  const serialize0 = performance.now();
  const serialized = JSON.stringify(input.body);
  const json_serialize_ms = Math.round(performance.now() - serialize0);
  const response_bytes = Buffer.byteLength(serialized, "utf8");
  const route_total_ms = Math.round(performance.now() - input.handlerT0);
  const rpc_ms = Math.round(
    serverPartial?.rpc_ms ??
      input.diagnostics.snapshotQueryAParallelEndMs ??
      input.diagnostics.roomBootstrapFetchMs ??
      input.snap_ms
  );
  const transport_slack_ms = Math.max(
    0,
    route_total_ms -
      input.auth_ms -
      input.canonical_ms -
      input.cache_lookup_ms -
      input.snap_ms -
      input.payload_build_ms -
      json_serialize_ms
  );
  const cmReqSrcRaw = (input.cmReqSrcRaw ?? "").trim() || "(absent)";
  logBootstrapColdFillDeepBreakdown({
    route_total_ms,
    auth_ms: input.auth_ms,
    canonical_ms: input.canonical_ms,
    cache_lookup_ms: input.cache_lookup_ms,
    rpc_ms,
    rpc_payload_bytes: serverPartial?.rpc_payload_bytes ?? 0,
    snapshot_deserialize_ms: serverPartial?.snapshot_deserialize_ms ?? 0,
    payload_build_ms: input.payload_build_ms,
    json_serialize_ms,
    response_bytes,
    transport_slack_ms,
    client_fetch_ms: null,
    client_json_parse_ms: null,
    client_apply_ms: null,
    client_render_ready_ms: null,
    first_message_visible_ms: null,
    snapshotTier: input.snapshotTier,
    cmReqSrc: normalizeBootstrapCmReqSrcBucket(input.cmReqSrcRaw),
    cmReqSrcRaw,
    cache_hit: input.cache_hit ? 1 : 0,
    room_id_short: roomIdShortForBootstrap(input.roomId),
    snapshot_via: serverPartial?.snapshot_via ?? input.diagnostics.roomBootstrapSnapshotVia ?? null,
    silent_delta_fallback: input.silent_delta_fallback ? 1 : 0,
    ...(serverPartial?.counter_upsert_ms != null
      ? { counter_upsert_ms: serverPartial.counter_upsert_ms }
      : {}),
  });
}

export function logBootstrapColdFillDeepBreakdownClient(
  input: Partial<BootstrapColdFillDeepBreakdown> & {
    snapshotTier: BootstrapSnapshotTier;
    cmReqSrcRaw: string;
    roomId: string;
    cache_hit?: 0 | 1;
  }
): void {
  if (process.env.NODE_ENV !== "development") return;
  const cmReqSrcRaw = input.cmReqSrcRaw.trim() || "(absent)";
  logBootstrapColdFillDeepBreakdown({
    route_total_ms: input.route_total_ms ?? 0,
    auth_ms: input.auth_ms ?? 0,
    canonical_ms: input.canonical_ms ?? 0,
    cache_lookup_ms: input.cache_lookup_ms ?? 0,
    rpc_ms: input.rpc_ms ?? 0,
    rpc_payload_bytes: input.rpc_payload_bytes ?? 0,
    snapshot_deserialize_ms: input.snapshot_deserialize_ms ?? 0,
    payload_build_ms: input.payload_build_ms ?? 0,
    json_serialize_ms: input.json_serialize_ms ?? 0,
    response_bytes: input.response_bytes ?? 0,
    transport_slack_ms: input.transport_slack_ms ?? 0,
    client_fetch_ms: input.client_fetch_ms ?? null,
    client_json_parse_ms: input.client_json_parse_ms ?? null,
    client_apply_ms: input.client_apply_ms ?? null,
    client_render_ready_ms: input.client_render_ready_ms ?? null,
    first_message_visible_ms: input.first_message_visible_ms ?? null,
    snapshotTier: input.snapshotTier,
    cmReqSrc: normalizeBootstrapCmReqSrcBucket(cmReqSrcRaw),
    cmReqSrcRaw,
    cache_hit: input.cache_hit ?? 0,
    room_id_short: roomIdShortForBootstrap(input.roomId),
    snapshot_via: input.snapshot_via ?? null,
    silent_delta_fallback: input.silent_delta_fallback ?? 0,
  });
}
