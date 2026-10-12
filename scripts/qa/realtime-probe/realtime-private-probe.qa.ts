/**
 * Real Supabase Realtime probe — isolated QA project ONLY (never Production).
 *
 * Runs the app's own Realtime modules against a live Realtime server:
 *   - private channel joins (messengerPrivateBroadcastChannelOptions)
 *   - incoming-call postgres_changes via acquireIncomingCallRealtimeSubscription (Global incoming path)
 *   - cm-call-invite shared hub (subscribeCommunityMessengerCallInviteBroadcast) + client REST send
 *   - message postgres_changes both directions (global-messenger:bundle:<uid>:0)
 *   - deny: outsider / anonymous
 *
 * Test users are pre-provisioned in the QA DB (password via GitHub secret RT_QA_PROBE_PASSWORD) in the throwaway
 * domain @rt-probe.dibay.invalid; fixtures go through QA-only probe RPCs (removed after the run).
 * Required env: RT_QA_URL, RT_QA_ANON_KEY (+ NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY = same QA values).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { messengerPrivateBroadcastChannelOptions, sendMessengerPrivateBroadcastFromClient } from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  CM_CALL_INVITE_BROADCAST_HANGUP,
  CM_CALL_INVITE_BROADCAST_RING,
  communityMessengerCallInviteChannelName,
  communityMessengerCallInviteListenerCount,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { acquireIncomingCallRealtimeSubscription } from "@/lib/community-messenger/realtime/cm-incoming-call-realtime-holder";

const URL = process.env.RT_QA_URL ?? "";
const ANON = process.env.RT_QA_ANON_KEY ?? "";
if (!URL.includes("gczyogboohpixpurckkg")) {
  throw new Error("realtime probe refuses to run outside the isolated QA project");
}

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
type User = { sb: SupabaseClient; id: string; email: string };

const results: Array<{ scenario: string; ok: boolean; detail: string }> = [];
function record(scenario: string, ok: boolean, detail = "") {
  results.push({ scenario, ok, detail });
  console.log(`RTQA ${ok ? "PASS" : "FAIL"} ${scenario}${detail ? ` — ${detail}` : ""}`);
}

function client(): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 50 } },
  });
}

async function signUpProbeUser(label: string): Promise<User> {
  // QA Auth rejects reserved test domains on signUp, so probe users are provisioned in the QA DB
  // (confirmed, @rt-probe.dibay.invalid only) and deleted after the run; only sign-in happens here.
  const sb = client();
  const email = `rt-${label}@rt-probe.dibay.invalid`;
  const password = process.env.RT_QA_PROBE_PASSWORD ?? "";
  if (!password) throw new Error("RT_QA_PROBE_PASSWORD (GitHub secret) is not set");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${label}: ${error.message}`);
  if (!data.session || !data.user) throw new Error(`signIn ${label}: no session`);
  await sb.realtime.setAuth(data.session.access_token);
  const { error: pErr } = await sb.rpc("qa_rt_probe_profile");
  if (pErr) throw new Error(`profile ${label}: ${pErr.message}`);
  return { sb, id: data.user.id, email };
}

function join(ch: RealtimeChannel, ms = 12_000): Promise<{ status: Status; err?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: "TIMED_OUT" }), ms);
    ch.subscribe((status, err) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve({ status: status as Status, err: err?.message });
      }
    });
  });
}

async function waitFor(pred: () => boolean, ms = 12_000, step = 50): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, step));
  }
  return null;
}

function channelJoined(sb: SupabaseClient, topic: string): boolean {
  return sb.getChannels().some((c) => c.topic === `realtime:${topic}` && (c as unknown as { state: string }).state === "joined");
}

let A: User;
let B: User;
let C: User;
let anon: SupabaseClient;
let roomId = "";

describe("Realtime private channel probe (isolated QA)", () => {
  beforeAll(async () => {
    A = await signUpProbeUser("a");
    B = await signUpProbeUser("b");
    C = await signUpProbeUser("c");
    anon = client();
    const { data, error } = await A.sb.rpc("qa_rt_probe_setup", { p_peer: B.id });
    if (error) throw new Error(`setup: ${error.message}`);
    roomId = String(data);
    console.log(`RTQA INFO users A=${A.id} B=${B.id} C=${C.id} room=${roomId}`);
  }, 60_000);

  afterAll(async () => {
    for (const u of [A, B, C]) {
      if (!u) continue;
      await u.sb.removeAllChannels();
      await u.sb.auth.signOut().catch(() => undefined);
    }
    await anon?.removeAllChannels();
    console.log(`RTQA SUMMARY pass=${results.filter((r) => r.ok).length} fail=${results.filter((r) => !r.ok).length}`);
  });

  it("anonymous / outsider joins are denied; QA public-access setting is recorded", async () => {
    const anonPriv = await join(anon.channel(communityMessengerCallInviteChannelName(B.id), messengerPrivateBroadcastChannelOptions()));
    record("deny.anon_private_call_invite", anonPriv.status !== "SUBSCRIBED", `${anonPriv.status} ${anonPriv.err ?? ""}`);

    const cInvite = await join(C.sb.channel(communityMessengerCallInviteChannelName(B.id), messengerPrivateBroadcastChannelOptions()));
    record("deny.outsider_call_invite_of_B", cInvite.status !== "SUBSCRIBED", `${cInvite.status} ${cInvite.err ?? ""}`);

    const cIncoming = await join(
      C.sb
        .channel(`community-messenger-incoming-call:${B.id}`, messengerPrivateBroadcastChannelOptions())
        .on("postgres_changes", { event: "*", schema: "public", table: "community_messenger_call_sessions", filter: `recipient_user_id=eq.${B.id}` }, () => undefined)
    );
    record("deny.outsider_incoming_call_of_B", cIncoming.status !== "SUBSCRIBED", `${cIncoming.status} ${cIncoming.err ?? ""}`);

    const cBump = await join(C.sb.channel(`community-messenger-room-bump:${roomId}`, messengerPrivateBroadcastChannelOptions()));
    record("deny.outsider_room_bump", cBump.status !== "SUBSCRIBED", `${cBump.status} ${cBump.err ?? ""}`);

    const pub = await join(anon.channel(`rt-probe-public-${randomBytes(4).toString("hex")}`), 8_000);
    record("info.qa_public_channel_join", true, `anon PUBLIC join on QA = ${pub.status} (Production = PrivateOnly)`);

    expect(anonPriv.status).not.toBe("SUBSCRIBED");
    expect(cInvite.status).not.toBe("SUBSCRIBED");
    expect(cIncoming.status).not.toBe("SUBSCRIBED");
    expect(cBump.status).not.toBe("SUBSCRIBED");
  }, 90_000);

  it("participant private joins succeed (room bump, own topics)", async () => {
    const bBump = await join(B.sb.channel(`community-messenger-room-bump:${roomId}`, messengerPrivateBroadcastChannelOptions()));
    record("join.participant_room_bump", bBump.status === "SUBSCRIBED", `${bBump.status} ${bBump.err ?? ""}`);
    expect(bBump.status).toBe("SUBSCRIBED");
  }, 30_000);

  it("incoming call INSERT + cancel UPDATE reach the callee via the Global incoming-call path; call-session channel scoped", async () => {
    const seen: Array<{ type: string; id: string; status: string }> = [];
    let status: string | null = null;
    const sub = acquireIncomingCallRealtimeSubscription({
      sb: B.sb,
      name: `community-messenger-incoming-call:${B.id}`,
      scope: "rt-probe:incoming",
      channelOptions: messengerPrivateBroadcastChannelOptions(),
      isCancelled: () => false,
      onStatus: (s) => {
        status = s;
      },
      build: (ch) =>
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "community_messenger_call_sessions", filter: `recipient_user_id=eq.${B.id}` },
          (p) => {
            const row = (p.new ?? {}) as { id?: string; status?: string };
            seen.push({ type: p.eventType, id: String(row.id ?? ""), status: String(row.status ?? "") });
          }
        ),
    });
    const joinedMs = await waitFor(() => status === "SUBSCRIBED");
    record("join.incoming_call_private (subscribeWithRetry)", joinedMs !== null, `status=${status} after ${joinedMs}ms`);
    expect(joinedMs).not.toBeNull();

    const t0 = Date.now();
    const { data: sid, error } = await A.sb.rpc("qa_rt_probe_call", { p_peer: B.id, p_room: roomId });
    expect(error).toBeNull();
    const insMs = await waitFor(() => seen.some((e) => e.type === "INSERT" && e.id === sid));
    record("call.incoming_insert_delivered", insMs !== null, `${insMs === null ? "not received" : `${Date.now() - t0}ms`}`);

    // call-session channel: both parties join, outsider denied
    const aSess = await join(
      A.sb
        .channel(`community-messenger-call-session:${sid}`, messengerPrivateBroadcastChannelOptions())
        .on("postgres_changes", { event: "*", schema: "public", table: "community_messenger_call_sessions", filter: `id=eq.${sid}` }, () => undefined)
    );
    const cSess = await join(
      C.sb
        .channel(`community-messenger-call-session:${sid}`, messengerPrivateBroadcastChannelOptions())
        .on("postgres_changes", { event: "*", schema: "public", table: "community_messenger_call_sessions", filter: `id=eq.${sid}` }, () => undefined)
    );
    record("join.call_session_party", aSess.status === "SUBSCRIBED", aSess.status);
    record("deny.call_session_outsider", cSess.status !== "SUBSCRIBED", `${cSess.status} ${cSess.err ?? ""}`);

    const t1 = Date.now();
    await A.sb.rpc("qa_rt_probe_call_status", { p_session: sid, p_status: "cancelled" });
    const updMs = await waitFor(() => seen.some((e) => e.type === "UPDATE" && e.id === sid && e.status === "cancelled"));
    record("call.cancel_update_delivered", updMs !== null, updMs === null ? "not received" : `${Date.now() - t1}ms`);
    await new Promise((r) => setTimeout(r, 1500));
    const dupInsert = seen.filter((e) => e.type === "INSERT" && e.id === sid).length;
    const dupUpdate = seen.filter((e) => e.type === "UPDATE" && e.id === sid && e.status === "cancelled").length;
    record("call.no_duplicate_events", dupInsert === 1 && dupUpdate === 1, `insert=${dupInsert} update=${dupUpdate}`);
    sub.stop();

    expect(insMs).not.toBeNull();
    expect(updMs).not.toBeNull();
    expect(aSess.status).toBe("SUBSCRIBED");
    expect(cSess.status).not.toBe("SUBSCRIBED");
    expect(dupInsert).toBe(1);
    expect(dupUpdate).toBe(1);
  }, 90_000);

  it("cm-call-invite shared hub: screen release keeps global listener; outsider send denied; re-receive after full teardown", async () => {
    const topic = communityMessengerCallInviteChannelName(B.id);
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
    // live 1:1 session A↔B so A may send to B's topic (INSERT policy)
    const { data: sid } = await A.sb.rpc("qa_rt_probe_call", { p_peer: B.id, p_room: roomId });

    const globalRing: unknown[] = [];
    const globalHangup: unknown[] = [];
    const screenHangup: unknown[] = [];
    const releaseGlobal = subscribeCommunityMessengerCallInviteBroadcast(B.sb, B.id, {
      onRing: (p) => globalRing.push(p),
      onHangup: (p) => globalHangup.push(p),
    });
    const releaseScreen = subscribeCommunityMessengerCallInviteBroadcast(B.sb, B.id, { onHangup: (p) => screenHangup.push(p) });
    const joinedMs = await waitFor(() => channelJoined(B.sb, topic));
    record("join.call_invite_hub_private", joinedMs !== null, `joined after ${joinedMs}ms, listeners=${communityMessengerCallInviteListenerCount(B.id)}`);
    expect(joinedMs).not.toBeNull();

    const send = (who: User, event: string) =>
      sendMessengerPrivateBroadcastFromClient({ sb: who.sb, topic, event, payload: { sessionId: sid }, scope: "rt-probe" });

    const t0 = Date.now();
    const r1 = await send(A, CM_CALL_INVITE_BROADCAST_RING);
    const ringMs = await waitFor(() => globalRing.length >= 1);
    record("invite.ring_delivered", r1.ok && ringMs !== null, `rest=${r1.status} delivered=${ringMs === null ? "no" : `${Date.now() - t0}ms`}`);

    releaseScreen(); // call screen closes
    const stillJoined = channelJoined(B.sb, topic);
    const r2 = await send(A, CM_CALL_INVITE_BROADCAST_HANGUP);
    const hangMs = await waitFor(() => globalHangup.length >= 1);
    record(
      "hub.global_listener_survives_screen_release",
      stillJoined && hangMs !== null && screenHangup.length === 0,
      `joined=${stillJoined} rest=${r2.status} globalHangup=${globalHangup.length} screenHangup=${screenHangup.length}`
    );

    const before = globalRing.length;
    const rC = await send(C, CM_CALL_INVITE_BROADCAST_RING);
    await new Promise((r) => setTimeout(r, 3000));
    record("deny.outsider_send_to_B_topic", !rC.ok && globalRing.length === before, `rest=${rC.status} ${rC.ok ? "" : rC.error}`);

    await new Promise((r) => setTimeout(r, 1000));
    record("hub.no_duplicate_dispatch", globalRing.length === 1 && globalHangup.length === 1, `ring=${globalRing.length} hangup=${globalHangup.length}`);

    releaseGlobal(); // last consumer → channel removed
    const removed = await waitFor(() => !B.sb.getChannels().some((c) => c.topic === `realtime:${topic}`), 5_000);
    const again: unknown[] = [];
    const releaseAgain = subscribeCommunityMessengerCallInviteBroadcast(B.sb, B.id, { onRing: (p) => again.push(p) });
    await waitFor(() => channelJoined(B.sb, topic));
    await send(A, CM_CALL_INVITE_BROADCAST_RING);
    const againMs = await waitFor(() => again.length >= 1);
    record("hub.re_receive_after_teardown", removed !== null && againMs !== null, `removed=${removed !== null} received=${againMs !== null}`);
    releaseAgain();

    expect(r1.ok).toBe(true);
    expect(ringMs).not.toBeNull();
    expect(hangMs).not.toBeNull();
    expect(screenHangup.length).toBe(0);
    expect(rC.ok).toBe(false);
    expect(globalRing.length).toBe(1);
    expect(againMs).not.toBeNull();
  }, 120_000);

  it("messages are delivered both ways in real time; outsider cannot join the bundle topic", async () => {
    const aGot: string[] = [];
    const bGot: string[] = [];
    const bundle = (u: User, sink: string[]) =>
      join(
        u.sb
          .channel(`global-messenger:bundle:${u.id}:0`, messengerPrivateBroadcastChannelOptions())
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "community_messenger_messages", filter: `room_id=in.(${roomId})` },
            (p) => sink.push(String((p.new as { id?: string }).id ?? ""))
          )
      );
    const [ja, jb] = await Promise.all([bundle(A, aGot), bundle(B, bGot)]);
    record("join.message_bundle_both", ja.status === "SUBSCRIBED" && jb.status === "SUBSCRIBED", `A=${ja.status} B=${jb.status}`);
    const cJoin = await join(
      C.sb
        .channel(`global-messenger:bundle:${B.id}:0`, messengerPrivateBroadcastChannelOptions())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messenger_messages", filter: `room_id=in.(${roomId})` }, () => undefined)
    );
    record("deny.outsider_bundle_topic_of_B", cJoin.status !== "SUBSCRIBED", `${cJoin.status} ${cJoin.err ?? ""}`);

    const t0 = Date.now();
    const { data: m1 } = await A.sb.rpc("qa_rt_probe_send", { p_room: roomId, p_text: "A→B" });
    const abMs = await waitFor(() => bGot.includes(String(m1)));
    record("message.A_to_B_realtime", abMs !== null, abMs === null ? "not received" : `${Date.now() - t0}ms`);

    const t1 = Date.now();
    const { data: m2 } = await B.sb.rpc("qa_rt_probe_send", { p_room: roomId, p_text: "B→A" });
    const baMs = await waitFor(() => aGot.includes(String(m2)));
    record("message.B_to_A_realtime", baMs !== null, baMs === null ? "not received" : `${Date.now() - t1}ms`);

    await new Promise((r) => setTimeout(r, 1500));
    const dups = bGot.filter((x) => x === String(m1)).length + aGot.filter((x) => x === String(m2)).length;
    record("message.no_duplicates", dups === 2, `count=${dups} (expected 2)`);

    expect(ja.status).toBe("SUBSCRIBED");
    expect(jb.status).toBe("SUBSCRIBED");
    expect(cJoin.status).not.toBe("SUBSCRIBED");
    expect(abMs).not.toBeNull();
    expect(baMs).not.toBeNull();
    expect(dups).toBe(2);
  }, 90_000);
});
