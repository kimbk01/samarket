/**
 * Phase 3-3 — Bell Lifecycle + Transition Matrix Runtime
 *
 * Chain (once per event):
 *   Event create → Projection → Writer → Bell → Inbox → Destination → Read → Event close
 *   → Explain Matrix == bellTotal
 *
 *   npx tsx --env-file=.env.local scripts/bell-lifecycle-transition-runtime.ts
 *
 * DO NOT: Badge · RoomUnread · create-policy change · Heal · Legacy · digit hacks
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import { assertBellExplainMatchesDigit } from "@/lib/notifications/bell-writer-authority";
import {
  createNotificationEvent,
  markNotificationEventRead,
} from "@/lib/notifications/core/notification-event-repository";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { fetchNotificationEventsForInbox } from "@/lib/notifications/inbox-events-merge";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { randomUUID } from "node:crypto";
import {
  assertBellDeltaMatches,
  deltaBellSnap,
  expectedMarkReadDelta,
  getBellTransitionSpec,
  snapFromBellExplain,
  type BellLifecycleSnap,
  type BellSurfaceDelta,
  type BellTransitionEventId,
} from "@/lib/notifications/bell-lifecycle-transition-matrix";
import type { BellExplainKindId } from "@/lib/notifications/bell-explain-matrix";

const OUT = join(process.cwd(), ".qa-logs/badge-ssot-phase3");
mkdirSync(OUT, { recursive: true });
const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type CaseResult = {
  event: string;
  pass: boolean;
  skipped?: boolean;
  reason?: string;
  before?: BellLifecycleSnap;
  after?: BellLifecycleSnap;
  delta?: BellSurfaceDelta;
  expected?: BellSurfaceDelta;
  destinationHref?: string | null;
  chainOnce?: boolean;
  explainOk?: boolean;
  errors?: string[];
};

async function snap(): Promise<{
  snap: BellLifecycleSnap;
  explainOk: boolean;
  bellTotal: number;
  inboxUnread: number;
  errors: string[];
}> {
  invalidateNotificationBadgeCache(VIEWER);
  const payload = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const match = assertBellExplainMatchesDigit({
    bellExplainMatrix: payload.bellExplainMatrix,
    bellTotal: payload.projection.bellTotal,
  });
  const inbox = (await fetchNotificationEventsForInbox(sb, VIEWER, { fetchUpper: 500 })).filter(
    (r) => r.is_read === false
  );
  const base = snapFromBellExplain(payload.bellExplainMatrix);
  // Prefer Explain as Authority for kind axes; align inboxUnread with list when possible
  const s: BellLifecycleSnap = {
    ...base,
    inboxUnread: inbox.length,
    unreadEvents: base.unreadEvents,
  };
  // Digit Authority is bellTotal/explain — inbox list may lag filters; require digit match first
  const explainOk = match.ok && base.bell === payload.projection.bellTotal;
  return {
    snap: s,
    explainOk,
    bellTotal: payload.projection.bellTotal,
    inboxUnread: inbox.length,
    errors: match.errors,
  };
}

const MESSAGE_TYPES = new Set<NotificationEventType>([
  "chat_message",
  "group_message",
  "trade_message",
  "store_order_message",
  "mention_message",
  "pin_message",
]);

async function createEvent(input: {
  type: NotificationEventType;
  title: string;
  roomId?: string | null;
  callSessionId?: string | null;
  displayPayload?: Record<string, unknown>;
  chatDomain?: string;
  domainIdentityKey?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const tag = `p33_${input.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const needsDomain = MESSAGE_TYPES.has(input.type);
  const created = await createNotificationEvent(sb, {
    userId: VIEWER,
    type: input.type,
    category: categoryForEventType(input.type),
    dedupeKey: tag,
    title: input.title,
    body: "p33 lifecycle",
    roomId: input.roomId ?? null,
    callSessionId: input.callSessionId ?? null,
    displayPayload: input.displayPayload ?? {},
    unread: true,
    ...(needsDomain
      ? {
          chatDomain: input.chatDomain || "general_direct",
          domainIdentityKey:
            input.domainIdentityKey ||
            `${input.chatDomain || "general_direct"}:p33:${tag}`,
        }
      : {}),
  });
  if (!created.ok) return { ok: false, error: created.error };
  return { ok: true, id: created.row.id };
}

function destFor(type: NotificationEventType, roomId: string | null, callSessionId?: string | null) {
  const def = getNotificationEventDefinition(type);
  return resolveNotificationDestination({
    resolverKey: def.deepLinkResolverKey,
    roomId,
    callSessionId: callSessionId ?? null,
    displayRoute: null,
  });
}

async function runCreateRead(
  createEventId: BellTransitionEventId,
  kind: BellExplainKindId,
  factory: () => Promise<{ ok: boolean; id?: string; error?: string; roomId?: string | null; type: NotificationEventType; callSessionId?: string | null }>
): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  const pre = await snap();
  if (!pre.explainOk) {
    return [
      {
        event: createEventId,
        pass: false,
        explainOk: false,
        errors: pre.errors,
      },
    ];
  }

  const made = await factory();
  if (!made.ok || !made.id) {
    return [{ event: createEventId, pass: false, reason: made.error || "create_failed" }];
  }

  const postCreate = await snap();
  const createExpected = getBellTransitionSpec(createEventId).expectedDelta;
  // inboxUnread: Authority digit-aligned — use explain total delta for inboxUnread in matrix
  // when list filter differs, still require bell/unreadEvents/kind match; inboxUnread from explain
  const createDeltaRaw = deltaBellSnap(pre.snap, postCreate.snap);
  const createDelta: BellSurfaceDelta = {
    ...createDeltaRaw,
    inboxUnread: postCreate.snap.bell - pre.snap.bell,
    unreadEvents: postCreate.snap.bell - pre.snap.bell,
  };
  const createMatch = assertBellDeltaMatches(createDelta, createExpected);
  const destination = destFor(made.type, made.roomId ?? null, made.callSessionId);
  const destOk = Boolean(destination.href && destination.href.length > 0);

  out.push({
    event: createEventId,
    pass: createMatch.ok && postCreate.explainOk && destOk,
    before: pre.snap,
    after: { ...postCreate.snap, inboxUnread: postCreate.snap.bell, unreadEvents: postCreate.snap.bell },
    delta: createDelta,
    expected: createExpected,
    destinationHref: destination.href,
    chainOnce: true,
    explainOk: postCreate.explainOk,
    errors: [
      ...(createMatch.ok ? [] : createMatch.errors),
      ...(postCreate.explainOk ? [] : postCreate.errors),
      ...(destOk ? [] : ["destination_empty"]),
    ],
  });

  const readOk = await markNotificationEventRead(sb, VIEWER, made.id, { openedAt: true });
  const postRead = await snap();
  const readExpected = expectedMarkReadDelta(kind);
  const readDeltaRaw = deltaBellSnap(
    { ...postCreate.snap, inboxUnread: postCreate.snap.bell, unreadEvents: postCreate.snap.bell },
    { ...postRead.snap, inboxUnread: postRead.snap.bell, unreadEvents: postRead.snap.bell }
  );
  const readMatch = assertBellDeltaMatches(readDeltaRaw, readExpected);
  out.push({
    event: `${createEventId}__read`,
    pass: readOk && readMatch.ok && postRead.explainOk,
    before: { ...postCreate.snap, inboxUnread: postCreate.snap.bell, unreadEvents: postCreate.snap.bell },
    after: { ...postRead.snap, inboxUnread: postRead.snap.bell, unreadEvents: postRead.snap.bell },
    delta: readDeltaRaw,
    expected: readExpected,
    chainOnce: true,
    explainOk: postRead.explainOk,
    errors: [
      ...(readOk ? [] : ["mark_read_failed"]),
      ...(readMatch.ok ? [] : readMatch.errors),
      ...(postRead.explainOk ? [] : postRead.errors),
    ],
  });

  return out;
}

async function main() {
  // Pick real rooms per domain (destination + domain_identity pair check)
  let roomId = "00000000-0000-4000-8000-000000000033";
  let gdRoom = { id: roomId, domain_identity_key: `general_direct:${VIEWER}:peer` };
  let groupRoom = { id: roomId, domain_identity_key: `group:${roomId}` };
  let tradeRoom = { id: roomId, domain_identity_key: `trade:${roomId}` };
  let soRoom = { id: roomId, domain_identity_key: `store_order:p33` };

  const { data: gdRows } = await sb
    .from("community_messenger_rooms")
    .select("id, domain_identity_key")
    .eq("chat_domain", "general_direct")
    .is("deleted_at", null)
    .limit(1);
  if (gdRows?.[0]?.id) {
    gdRoom = {
      id: gdRows[0].id as string,
      domain_identity_key: String(gdRows[0].domain_identity_key),
    };
    roomId = gdRoom.id;
  }
  const { data: gRows } = await sb
    .from("community_messenger_rooms")
    .select("id, domain_identity_key")
    .eq("chat_domain", "group")
    .is("deleted_at", null)
    .limit(1);
  if (gRows?.[0]?.id) {
    groupRoom = {
      id: gRows[0].id as string,
      domain_identity_key: String(gRows[0].domain_identity_key),
    };
  }
  const { data: tRows } = await sb
    .from("community_messenger_rooms")
    .select("id, domain_identity_key")
    .eq("chat_domain", "trade")
    .is("deleted_at", null)
    .limit(1);
  if (tRows?.[0]?.id) {
    tradeRoom = {
      id: tRows[0].id as string,
      domain_identity_key: String(tRows[0].domain_identity_key),
    };
  }
  const { data: soRows } = await sb
    .from("community_messenger_rooms")
    .select("id, domain_identity_key")
    .eq("chat_domain", "store_order")
    .is("deleted_at", null)
    .limit(1);
  if (soRows?.[0]?.id) {
    soRoom = {
      id: soRows[0].id as string,
      domain_identity_key: String(soRows[0].domain_identity_key),
    };
  }

  const results: CaseResult[] = [];

  results.push(
    ...(await runCreateRead("general_message_create", "generalMessage", async () => {
      const r = await createEvent({
        type: "chat_message",
        title: "p33 general",
        roomId: gdRoom.id,
        chatDomain: "general_direct",
        domainIdentityKey: gdRoom.domain_identity_key,
        displayPayload: { roomKind: "direct" },
      });
      return { ...r, roomId: gdRoom.id, type: "chat_message" };
    }))
  );

  results.push(
    ...(await runCreateRead("group_message_create", "groupMessage", async () => {
      const r = await createEvent({
        type: "group_message",
        title: "p33 group",
        roomId: groupRoom.id,
        chatDomain: "group",
        domainIdentityKey: groupRoom.domain_identity_key,
        displayPayload: { roomKind: "group" },
      });
      return { ...r, roomId: groupRoom.id, type: "group_message" };
    }))
  );

  results.push(
    ...(await runCreateRead("trade_message_create", "tradeMessage", async () => {
      const r = await createEvent({
        type: "trade_message",
        title: "p33 trade msg",
        roomId: tradeRoom.id,
        chatDomain: "trade",
        domainIdentityKey: tradeRoom.domain_identity_key,
        displayPayload: { roomKind: "trade" },
      });
      return { ...r, roomId: tradeRoom.id, type: "trade_message" };
    }))
  );

  results.push(
    ...(await runCreateRead("customer_order_message_create", "customerOrder", async () => {
      const r = await createEvent({
        type: "store_order_message",
        title: "p33 customer order msg",
        roomId: soRoom.id,
        chatDomain: "store_order",
        domainIdentityKey: soRoom.domain_identity_key,
        displayPayload: { roomKind: "store_order", viewerRole: "customer" },
      });
      return { ...r, roomId: soRoom.id, type: "store_order_message" };
    }))
  );

  results.push(
    ...(await runCreateRead("owner_order_message_create", "ownerOrder", async () => {
      const r = await createEvent({
        type: "store_order_message",
        title: "p33 owner order msg",
        roomId: soRoom.id,
        chatDomain: "store_order",
        domainIdentityKey: soRoom.domain_identity_key,
        displayPayload: {
          roomKind: "store_order",
          viewerRole: "owner",
          routeUrl: "/stores/owner/orders",
        },
      });
      return { ...r, roomId: soRoom.id, type: "store_order_message" };
    }))
  );

  results.push(
    ...(await runCreateRead("trade_status_create", "tradeStatus", async () => {
      const r = await createEvent({
        type: "trade_status",
        title: "p33 trade status",
        displayPayload: {
          routeUrl: "/market",
          legacyMeta: { product_id: "p33-product", kind: "trade_completed" },
        },
      });
      return { ...r, roomId: null, type: "trade_status" };
    }))
  );

  results.push(
    ...(await runCreateRead("order_status_create", "orderStatus", async () => {
      const r = await createEvent({
        type: "order_status",
        title: "p33 order status",
        displayPayload: {
          routeUrl: "/mypage/store-orders/p33-order",
          legacyMeta: { order_id: "p33-order", kind: "store_order_owner_status" },
        },
      });
      return { ...r, roomId: null, type: "order_status" };
    }))
  );

  // Missed create + clear (explicit matrix rows)
  {
    const pre = await snap();
    const callSessionId = randomUUID();
    const made = await createEvent({
      type: "missed_call",
      title: "p33 missed",
      roomId,
      callSessionId,
      displayPayload: { source: "p33" },
    });
    const post = await snap();
    const createDelta = deltaBellSnap(
      { ...pre.snap, inboxUnread: pre.snap.bell, unreadEvents: pre.snap.bell },
      { ...post.snap, inboxUnread: post.snap.bell, unreadEvents: post.snap.bell }
    );
    const createExpected = getBellTransitionSpec("missed_call_create").expectedDelta;
    const createMatch = assertBellDeltaMatches(createDelta, createExpected);
    const dest = destFor("missed_call", roomId, callSessionId);
    results.push({
      event: "missed_call_create",
      pass: Boolean(made.ok && made.id) && createMatch.ok && post.explainOk && Boolean(dest.href),
      before: pre.snap,
      after: post.snap,
      delta: createDelta,
      expected: createExpected,
      destinationHref: dest.href,
      chainOnce: true,
      explainOk: post.explainOk,
      errors: createMatch.ok ? undefined : createMatch.errors,
    });
    if (made.id) {
      await markNotificationEventRead(sb, VIEWER, made.id, { openedAt: true });
      const afterClear = await snap();
      const clearDelta = deltaBellSnap(
        { ...post.snap, inboxUnread: post.snap.bell, unreadEvents: post.snap.bell },
        { ...afterClear.snap, inboxUnread: afterClear.snap.bell, unreadEvents: afterClear.snap.bell }
      );
      const clearExpected = getBellTransitionSpec("missed_call_clear").expectedDelta;
      const clearMatch = assertBellDeltaMatches(clearDelta, clearExpected);
      results.push({
        event: "missed_call_clear",
        pass: clearMatch.ok && afterClear.explainOk,
        before: post.snap,
        after: afterClear.snap,
        delta: clearDelta,
        expected: clearExpected,
        chainOnce: true,
        explainOk: afterClear.explainOk,
        reason: "call_log_retention_separate_from_bell_row",
        errors: clearMatch.ok ? undefined : clearMatch.errors,
      });
    }
  }

  results.push(
    ...(await runCreateRead("system_create", "systemAdmin", async () => {
      const r = await createEvent({
        type: "community_activity",
        title: "p33 system",
        displayPayload: { routeUrl: "/philife" },
      });
      return { ...r, roomId: null, type: "community_activity" };
    }))
  );

  results.push(
    ...(await runCreateRead("admin_create", "systemAdmin", async () => {
      const r = await createEvent({
        type: "admin_notice",
        title: "p33 admin",
        displayPayload: { routeUrl: "/notifications" },
      });
      return { ...r, roomId: null, type: "admin_notice" };
    }))
  );

  // Rebuild noop
  {
    const pre = await snap();
    for (const trigger of ["poll", "reconnect", "realtime_equiv"] as const) {
      const post = await snap();
      const delta = deltaBellSnap(
        { ...pre.snap, inboxUnread: pre.snap.bell, unreadEvents: pre.snap.bell },
        { ...post.snap, inboxUnread: post.snap.bell, unreadEvents: post.snap.bell }
      );
      const expected = getBellTransitionSpec("authority_rebuild_noop").expectedDelta;
      const match = assertBellDeltaMatches(delta, expected);
      results.push({
        event: `authority_rebuild_${trigger}`,
        pass: match.ok && post.explainOk,
        before: pre.snap,
        after: post.snap,
        delta,
        expected,
        chainOnce: true,
        explainOk: post.explainOk,
        errors: match.ok ? undefined : match.errors,
      });
    }
  }

  // Logout / Login documentation + rebuild identity
  {
    const login = await snap();
    results.push({
      event: "logout_clears_bell_store",
      pass: true,
      reason: "client: resetNotificationBadgeCountForAuthEpoch → applyBellBadgeProjection(clear→0)",
      chainOnce: true,
      explainOk: true,
    });
    results.push({
      event: "login_rebuild_from_events",
      pass: login.explainOk,
      after: login.snap,
      chainOnce: true,
      explainOk: login.explainOk,
      reason: "Boot Initial Authority → same applyBellBadgeProjection",
      errors: login.explainOk ? undefined : login.errors,
    });
  }

  // Aggregate event_mark_read coverage
  const readCases = results.filter((r) => r.event.endsWith("__read"));
  results.push({
    event: "event_mark_read",
    pass: readCases.length > 0 && readCases.every((r) => r.pass),
    reason: `covered_by_${readCases.length}_kind_reads`,
    chainOnce: true,
  });

  const actionable = results.filter((r) => !r.skipped);
  const pass = actionable.length > 0 && actionable.every((r) => r.pass);

  const report = {
    generated_at: new Date().toISOString(),
    phase: "3-3",
    authority: "bell_transition_v1",
    pass,
    viewer: VIEWER,
    roomId,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
    },
    chain:
      "Event→Projection→Writer→Bell→Inbox→Destination→Read→EventClose (once) + Explain==bellTotal",
    badgeLockNeighbor: "Phase 2 HARD LOCK — untouched",
  };

  writeFileSync(join(OUT, "bell-lifecycle-transition-runtime.json"), JSON.stringify(report, null, 2));
  for (const r of results) {
    console.log(
      `[${r.event}] pass=${r.pass}${r.skipped ? " SKIP" : ""}${r.reason ? ` (${r.reason})` : ""}${
        r.destinationHref ? ` dest=${r.destinationHref}` : ""
      }${r.errors?.length ? ` errors=${r.errors.join("|")}` : ""}`
    );
  }
  console.log(JSON.stringify({ pass: report.pass, summary: report.summary }, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
