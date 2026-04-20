/**
 * Applies community service + board seed (PostgREST), wires one CM room summary for E2E diag.
 * Reads .env.local — requires SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const BOARDS_SELECT =
  "id, service_id, name, slug, description, skin_type, form_type, category_mode, policy, is_active, sort_order";

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(".env.local: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let svc = await sb.from("services").select("id, slug, name, is_active").eq("slug", "community").maybeSingle();
  if (!svc.data) {
    const ins = await sb
      .from("services")
      .insert({ slug: "community", name: "동네생활", is_active: true, service_type: "community" })
      .select("id, slug")
      .single();
    if (ins.error) throw new Error(`services insert: ${ins.error.message}`);
    svc = { data: ins.data, error: null };
  }

  const serviceId = String(svc.data.id);
  let boards = await sb.from("boards").select(BOARDS_SELECT).eq("service_id", serviceId).eq("is_active", true);
  if (!boards.data?.length) {
    const bins = await sb
      .from("boards")
      .insert({
        service_id: serviceId,
        name: "동네생활",
        slug: "neighborhood",
        description: null,
        skin_type: "basic",
        form_type: "basic",
        category_mode: "none",
        policy: { allow_comment: true, allow_like: true, allow_report: true },
        is_active: true,
        sort_order: 0,
      })
      .select("id, slug, name")
      .single();
    if (bins.error) throw new Error(`boards insert: ${bins.error.message}`);
    boards = { data: [bins.data], error: null };
  }

  const boardsList = await sb.from("boards").select(BOARDS_SELECT).eq("service_id", serviceId).eq("is_active", true).order("sort_order", { ascending: true });

  const boardRow = boardsList.data?.[0];
  const createPostBoardOk = !!boardRow && String(boardRow.service_id) === serviceId;

  const { data: pcList } = await sb
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id, community_messenger_room_id, trade_flow_status")
    .limit(20);
  let pc = (pcList ?? [])[0];
  if (!pc?.id) {
    console.log(
      JSON.stringify(
        {
          seed: { serviceId, boards: boardsList.data ?? [] },
          listCommunityBoards_count: (boardsList.data ?? []).length,
          createPostBoardValidation: createPostBoardOk,
          roomWire: { ok: false, reason: "no_product_chats" },
          E2E_SNAPSHOT_DIAG_ROOM_ID: null,
        },
        null,
        2
      )
    );
    return;
  }

  let e2eUserId = "";
  const devOrigin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  try {
    const loginRes = await fetch(`${devOrigin.replace(/\/$/, "")}/api/test-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.E2E_TEST_USERNAME?.trim() || "aaaa",
        password: process.env.E2E_TEST_PASSWORD ?? "1234",
      }),
    });
    const body = await loginRes.json().catch(() => ({}));
    if (body?.userId) e2eUserId = String(body.userId);
  } catch {
    /* dev server down */
  }

  if (e2eUserId) {
    const match = (pcList ?? []).find(
      (r) => String(r.seller_id) === e2eUserId || String(r.buyer_id) === e2eUserId
    );
    if (match) pc = match;
  }

  const summary = JSON.stringify({
    v: 1,
    kind: "trade",
    headline: "E2E diag seed",
    productChatId: String(pc.id),
    roleLabel: "구매자",
    tradeFlowStatus: String(pc.trade_flow_status ?? "chatting"),
  });

  let targetRoomId = String(pc.community_messenger_room_id ?? "").trim();
  if (!targetRoomId && e2eUserId) {
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("room_id")
      .eq("user_id", e2eUserId)
      .limit(10);
    const rid = (parts ?? []).map((p) => String(p.room_id)).find(Boolean);
    targetRoomId = rid ? String(rid).trim() : "";
  }
  if (!targetRoomId) {
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("room_id")
      .in("user_id", [String(pc.seller_id), String(pc.buyer_id)])
      .limit(5);
    const rid = (parts ?? [])[0]?.room_id;
    targetRoomId = rid ? String(rid).trim() : "";
  }

  let roomUpdate = { ok: false, error: "no_room" };
  if (targetRoomId) {
    const ur = await sb.from("community_messenger_rooms").update({ summary }).eq("id", targetRoomId).select("id").maybeSingle();
    if (ur.error) roomUpdate = { ok: false, error: ur.error.message };
    else roomUpdate = { ok: true, roomId: targetRoomId };
  }

  console.log(
    JSON.stringify(
      {
        seed: { serviceId, community_slug: "community", boards: boardsList.data ?? [] },
        listCommunityBoards_count: (boardsList.data ?? []).length,
        createPostBoardValidation: createPostBoardOk,
        e2eUserId: e2eUserId || null,
        roomWire: {
          ok: roomUpdate.ok === true,
          roomId: targetRoomId || null,
          productChatId: pc.id,
          summaryPreview: summary.slice(0, 120),
          updateError: roomUpdate.ok ? null : roomUpdate.error ?? "unknown",
        },
        E2E_SNAPSHOT_DIAG_ROOM_ID: targetRoomId || null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
