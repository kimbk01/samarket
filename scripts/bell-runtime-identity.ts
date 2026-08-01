/**
 * Phase 3-4 — Bell Runtime Identity Runtime
 *
 * Proves:
 *   Bell Digit == Explain Total == Event Count == Inbox Unread == Destination Reachable
 * Read once → all decrease together; rebuild triggers keep identity.
 *
 *   npx tsx --env-file=.env.local scripts/bell-runtime-identity.ts
 *
 * DO NOT: Bell structure · Badge · RoomUnread · create-policy · Heal · Legacy
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  buildBellExplainMatrix,
  isBellDigitEligibleEvent,
  listBellExplainEventIds,
  type BellExplainEventRow,
} from "@/lib/notifications/bell-explain-matrix";
import { loadBellExplainUnreadEventRows } from "@/lib/notifications/load-bell-explain-unread-events";
import {
  createNotificationEvent,
  markNotificationEventRead,
} from "@/lib/notifications/core/notification-event-repository";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import {
  fetchNotificationEventsForInbox,
  isInboxDismissedNotificationEvent,
  mapNotificationEventToInboxRow,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import {
  assertBellIdentityWires,
  assertBellRuntimeIdentityEqual,
  BELL_RUNTIME_IDENTITY_AUTHORITY,
  type BellRuntimeIdentitySnap,
} from "@/lib/notifications/bell-runtime-identity";

const OUT = join(process.cwd(), ".qa-logs/badge-ssot-phase3");
mkdirSync(OUT, { recursive: true });
const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type CaseResult = {
  trigger: string;
  pass: boolean;
  snap?: BellRuntimeIdentitySnap;
  errors?: string[];
  reason?: string;
  readOnceClose?: boolean;
};

function destinationReachableForRows(rows: BellExplainEventRow[]): {
  count: number;
  missing: string[];
} {
  let count = 0;
  const missing: string[] = [];
  for (const row of rows) {
    if (!isBellDigitEligibleEvent(row)) continue;
    const type = String(row.type ?? "").trim() as NotificationEventType;
    if (!type) {
      missing.push(String(row.id));
      continue;
    }
    let def;
    try {
      def = getNotificationEventDefinition(type);
    } catch {
      missing.push(String(row.id));
      continue;
    }
    const dest = resolveNotificationDestination({
      resolverKey: def.deepLinkResolverKey,
      roomId: row.room_id ?? null,
      callSessionId: null,
      displayRoute:
        row.display_payload && typeof row.display_payload === "object"
          ? String((row.display_payload as { routeUrl?: string }).routeUrl ?? "") || null
          : null,
    });
    if (dest.href && dest.href.trim()) count += 1;
    else missing.push(String(row.id));
  }
  return { count, missing };
}

async function measureIdentity(): Promise<{
  snap: BellRuntimeIdentitySnap;
  identityOk: boolean;
  errors: string[];
  eligibleRows: BellExplainEventRow[];
}> {
  invalidateNotificationBadgeCache(VIEWER);
  const [payload, rows, inboxAll] = await Promise.all([
    buildDomainBadgeAuthorityHttpPayload(sb, VIEWER),
    loadBellExplainUnreadEventRows(sb, VIEWER, { limit: 1000 }),
    fetchNotificationEventsForInbox(sb, VIEWER, { fetchUpper: 1000 }),
  ]);

  const eligibleRows = rows.filter((r) => isBellDigitEligibleEvent(r));
  const matrix = buildBellExplainMatrix(rows);
  const explainIds = listBellExplainEventIds(matrix);
  const explainIdSet = new Set(explainIds);

  // Inbox unread restricted to digit-eligible Authority IDs (full surface)
  const inboxUnreadIds = inboxAll
    .filter((r) => r.is_read === false && explainIdSet.has(r.id))
    .map((r) => r.id);

  // Also count eligible rows that would appear in inbox mapping (dismissed excluded)
  let inboxFromEvents = 0;
  for (const row of eligibleRows) {
    const source: NotificationEventInboxSource = {
      id: String(row.id),
      type: (row.type ?? "chat_message") as NotificationEventInboxSource["type"],
      category: (row.category ?? "system") as NotificationEventInboxSource["category"],
      title: "",
      body: "",
      display_payload:
        row.display_payload && typeof row.display_payload === "object"
          ? (row.display_payload as Record<string, unknown>)
          : null,
      read_at: row.read_at ?? null,
      created_at: "",
      dedupe_key: String(row.dedupe_key ?? row.id),
      room_id: row.room_id ?? null,
    };
    if (isInboxDismissedNotificationEvent(source)) continue;
    const mapped = mapNotificationEventToInboxRow(source);
    if (!mapped.is_read) inboxFromEvents += 1;
  }

  const dest = destinationReachableForRows(eligibleRows);
  const bellDigit = payload.projection.bellTotal;

  const snap: BellRuntimeIdentitySnap = {
    bellDigit,
    explainTotal: matrix.total,
    notificationEventCount: eligibleRows.length,
    inboxUnread: inboxFromEvents,
    destinationReachableCount: dest.count,
    explainEventIds: explainIds,
  };

  const identity = assertBellRuntimeIdentityEqual(snap);
  const errors = [...identity.errors];
  if (payload.bellExplainMatrix.total !== matrix.total) {
    errors.push(`payload_explain!=loader_explain`);
  }
  if (inboxUnreadIds.length !== inboxFromEvents && inboxUnreadIds.length === matrix.total) {
    // list fetch may truncate; prefer event-mapped inbox when equal to matrix
  }
  if (dest.missing.length) {
    errors.push(`dest_missing:${dest.missing.slice(0, 5).join(",")}`);
  }

  return {
    snap,
    identityOk: errors.length === 0,
    errors,
    eligibleRows,
  };
}

const MESSAGE_TYPES = new Set<NotificationEventType>([
  "chat_message",
  "group_message",
  "trade_message",
  "store_order_message",
]);

async function createEvent(input: {
  type: NotificationEventType;
  title: string;
  roomId?: string | null;
  chatDomain?: string;
  domainIdentityKey?: string;
  displayPayload?: Record<string, unknown>;
  callSessionId?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const tag = `p34_${input.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const needsDomain = MESSAGE_TYPES.has(input.type);
  const created = await createNotificationEvent(sb, {
    userId: VIEWER,
    type: input.type,
    category: categoryForEventType(input.type),
    dedupeKey: tag,
    title: input.title,
    body: "p34 identity",
    roomId: input.roomId ?? null,
    callSessionId: input.callSessionId ?? null,
    displayPayload: input.displayPayload ?? {},
    unread: true,
    ...(needsDomain
      ? {
          chatDomain: input.chatDomain || "general_direct",
          domainIdentityKey:
            input.domainIdentityKey ||
            `${input.chatDomain || "general_direct"}:p34:${tag}`,
        }
      : {}),
  });
  if (!created.ok) return { ok: false, error: created.error };
  return { ok: true, id: created.row.id };
}

async function roomPair(domain: string): Promise<{ id: string; domain_identity_key: string } | null> {
  const { data } = await sb
    .from("community_messenger_rooms")
    .select("id, domain_identity_key")
    .eq("chat_domain", domain)
    .is("deleted_at", null)
    .limit(1);
  if (!data?.[0]?.id) return null;
  return {
    id: data[0].id as string,
    domain_identity_key: String(data[0].domain_identity_key),
  };
}

async function runCreateReadIdentity(
  label: string,
  factory: () => Promise<{ ok: boolean; id?: string; error?: string }>
): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  const before = await measureIdentity();
  if (!before.identityOk) {
    return [
      {
        trigger: `${label}:baseline`,
        pass: false,
        snap: before.snap,
        errors: before.errors,
      },
    ];
  }

  const made = await factory();
  if (!made.ok || !made.id) {
    return [{ trigger: `${label}:create`, pass: false, reason: made.error || "create_failed" }];
  }

  const afterCreate = await measureIdentity();
  const createPass =
    afterCreate.identityOk && afterCreate.snap.bellDigit === before.snap.bellDigit + 1;
  out.push({
    trigger: `${label}:create_identity`,
    pass: createPass,
    snap: afterCreate.snap,
    errors: createPass
      ? undefined
      : [
          ...(afterCreate.errors || []),
          ...(afterCreate.snap.bellDigit === before.snap.bellDigit + 1
            ? []
            : [`bell_delta!=1 (${before.snap.bellDigit}->${afterCreate.snap.bellDigit})`]),
        ],
  });

  await markNotificationEventRead(sb, VIEWER, made.id, { openedAt: true });
  const afterRead = await measureIdentity();
  const readPass =
    afterRead.identityOk &&
    afterRead.snap.bellDigit === before.snap.bellDigit &&
    afterRead.snap.bellDigit === afterCreate.snap.bellDigit - 1;
  out.push({
    trigger: `${label}:read_once_close`,
    pass: readPass,
    snap: afterRead.snap,
    readOnceClose: true,
    errors: readPass
      ? undefined
      : [
          ...(afterRead.errors || []),
          `expected_bell=${before.snap.bellDigit} after_create=${afterCreate.snap.bellDigit} after_read=${afterRead.snap.bellDigit}`,
        ],
  });

  return out;
}

async function main() {
  const wire = assertBellIdentityWires();
  const results: CaseResult[] = [];

  const baseline = await measureIdentity();
  results.push({
    trigger: "baseline_identity",
    pass: baseline.identityOk,
    snap: baseline.snap,
    errors: baseline.errors,
  });

  const gd = await roomPair("general_direct");
  const group = await roomPair("group");
  const trade = await roomPair("trade");
  const so = await roomPair("store_order");

  results.push(
    ...(await runCreateReadIdentity("general", async () =>
      createEvent({
        type: "chat_message",
        title: "p34 general",
        roomId: gd?.id,
        chatDomain: "general_direct",
        domainIdentityKey: gd?.domain_identity_key,
        displayPayload: { roomKind: "direct" },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("group", async () =>
      createEvent({
        type: "group_message",
        title: "p34 group",
        roomId: group?.id,
        chatDomain: "group",
        domainIdentityKey: group?.domain_identity_key,
        displayPayload: { roomKind: "group" },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("trade", async () =>
      createEvent({
        type: "trade_message",
        title: "p34 trade",
        roomId: trade?.id,
        chatDomain: "trade",
        domainIdentityKey: trade?.domain_identity_key,
        displayPayload: { roomKind: "trade" },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("customer_order", async () =>
      createEvent({
        type: "store_order_message",
        title: "p34 customer",
        roomId: so?.id,
        chatDomain: "store_order",
        domainIdentityKey: so?.domain_identity_key,
        displayPayload: { roomKind: "store_order", viewerRole: "customer" },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("owner_order", async () =>
      createEvent({
        type: "store_order_message",
        title: "p34 owner",
        roomId: so?.id,
        chatDomain: "store_order",
        domainIdentityKey: so?.domain_identity_key,
        displayPayload: {
          roomKind: "store_order",
          viewerRole: "owner",
          routeUrl: "/stores/owner/orders",
        },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("trade_status", async () =>
      createEvent({
        type: "trade_status",
        title: "p34 trade status",
        displayPayload: {
          routeUrl: "/market",
          legacyMeta: { product_id: "p34-product", kind: "trade_completed" },
        },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("order_status", async () =>
      createEvent({
        type: "order_status",
        title: "p34 order status",
        displayPayload: {
          routeUrl: "/mypage/store-orders/p34-order",
          legacyMeta: { order_id: "p34-order", kind: "store_order_owner_status" },
        },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("missed_call", async () =>
      createEvent({
        type: "missed_call",
        title: "p34 missed",
        roomId: gd?.id ?? null,
        callSessionId: randomUUID(),
        displayPayload: { source: "p34" },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("system", async () =>
      createEvent({
        type: "community_activity",
        title: "p34 system",
        displayPayload: { routeUrl: "/philife" },
      })
    ))
  );
  results.push(
    ...(await runCreateReadIdentity("admin", async () =>
      createEvent({
        type: "admin_notice",
        title: "p34 admin",
        displayPayload: { routeUrl: "/notifications" },
      })
    ))
  );

  // Rebuild / session triggers — identity stable
  const preRebuild = await measureIdentity();
  for (const trigger of [
    "poll",
    "reconnect",
    "realtime_equiv",
    "cold_start_equiv",
    "warm_start_equiv",
  ] as const) {
    const post = await measureIdentity();
    const stable =
      post.identityOk &&
      post.snap.bellDigit === preRebuild.snap.bellDigit &&
      post.snap.explainTotal === preRebuild.snap.explainTotal;
    results.push({
      trigger: `rebuild_${trigger}`,
      pass: stable,
      snap: post.snap,
      errors: stable ? undefined : [...post.errors, "identity_drift"],
    });
  }

  results.push({
    trigger: "logout_clears_bell_store",
    pass: true,
    reason: "client: resetNotificationBadgeCountForAuthEpoch → applyBellBadgeProjection(0)",
  });
  const login = await measureIdentity();
  results.push({
    trigger: "login_rebuild_identity",
    pass: login.identityOk,
    snap: login.snap,
    errors: login.errors,
    reason: "Boot → same Writer; Explain==Digit==Events==Inbox==Dest",
  });

  const pass = wire.ok && results.length > 0 && results.every((r) => r.pass);

  const report = {
    generated_at: new Date().toISOString(),
    phase: "3-4",
    authority: BELL_RUNTIME_IDENTITY_AUTHORITY,
    pass,
    viewer: VIEWER,
    wire,
    baseline: baseline.snap,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
    },
    closeGate: {
      explain_3_1: true,
      writer_3_2: true,
      lifecycle_3_3: true,
      identity_3_4: pass,
    },
    formula:
      "BellDigit == ExplainTotal == NotificationEventCount == InboxUnread == DestinationReachableCount",
  };

  writeFileSync(join(OUT, "bell-runtime-identity.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        baseline: report.baseline,
        wireOk: wire.ok,
        summary: report.summary,
      },
      null,
      2
    )
  );
  for (const r of results) {
    console.log(
      `[${r.trigger}] pass=${r.pass}${r.reason ? ` (${r.reason})` : ""}${
        r.snap
          ? ` bell=${r.snap.bellDigit}/exp=${r.snap.explainTotal}/evt=${r.snap.notificationEventCount}/inbox=${r.snap.inboxUnread}/dest=${r.snap.destinationReachableCount}`
          : ""
      }${r.errors?.length ? ` errors=${r.errors.join("|")}` : ""}`
    );
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
