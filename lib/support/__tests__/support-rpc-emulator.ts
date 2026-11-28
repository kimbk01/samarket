/**
 * 시험 전용 — 고객센터 DB 함수(supabase/migrations/20271129100000_support_full_fix.sql)를 메모리 표 위에서 같은 규칙으로 흉내 낸다.
 * support_append_message(요청 id · 종료 거부) · support_open_case · support_transition_case · allocate_support_public_case_no.
 * SQL 과 다르게 고치면 시험이 실제 함수와 어긋난다 — SQL 을 바꾸면 여기도 같이 바꾼다.
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null };

const ACTIVE = ["OPEN", "WAITING_ADMIN", "WAITING_USER"];
const CLOSED = ["RESOLVED", "ARCHIVED"];

export function createSupportRpcEmulator(db: Record<string, Row[]>, now: () => string) {
  let seq = 100000;
  const t = (name: string) => (db[name] ??= []);
  const ms = (v: unknown) => Math.floor(Date.parse(String(v ?? "")));

  function append(a: Record<string, unknown>): Res {
    const c = t("support_cases").find((x) => x.id === a.p_case_id);
    if (!c) return { data: null, error: { message: "support_case_not_found" } };
    const rid = (a.p_client_request_id as string | null | undefined) ?? null;
    if (rid) {
      const prev = t("support_messages").find((m) => m.client_request_id === rid);
      if (prev) {
        const same =
          prev.case_id === a.p_case_id &&
          prev.sender_type === a.p_sender_type &&
          (prev.sender_user_id ?? null) === (a.p_sender_user_id ?? null) &&
          (prev.sender_admin_id ?? null) === (a.p_sender_admin_id ?? null) &&
          prev.message_type === a.p_message_type;
        if (!same) return { data: null, error: { message: "support_request_id_conflict", code: "P0001" } };
        return { data: { ...prev, replayed: true }, error: null };
      }
    }
    const at = now();
    if (a.p_message_type === "PUBLIC" && CLOSED.includes(String(c.status))) {
      return { data: null, error: { message: "support_case_closed", code: "P0001" } };
    }
    const msg: Row = {
      id: randomUUID(),
      created_at: at,
      case_id: a.p_case_id,
      sender_type: a.p_sender_type,
      sender_user_id: a.p_sender_user_id ?? null,
      sender_admin_id: a.p_sender_admin_id ?? null,
      message_type: a.p_message_type,
      body: a.p_body,
      edited_at: null,
      deleted_at: null,
      client_request_id: rid,
    };
    t("support_messages").push(msg);
    const later = (x: unknown) => (String(x ?? "") > at ? x : at);
    if (a.p_sender_type === "ADMIN" && a.p_message_type === "PUBLIC") {
      Object.assign(c, {
        status: "WAITING_USER",
        requester_unread_count: Number(c.requester_unread_count ?? 0) + 1,
        first_admin_response_at: c.first_admin_response_at ?? at,
        last_message_at: later(c.last_message_at),
        updated_at: at,
      });
    } else if ((a.p_sender_type === "MEMBER" || a.p_sender_type === "OWNER") && !a.p_system_seed) {
      Object.assign(c, {
        status: "WAITING_ADMIN",
        admin_unread_count: Number(c.admin_unread_count ?? 0) + 1,
        last_message_at: later(c.last_message_at),
        updated_at: at,
      });
    } else if (a.p_message_type === "PUBLIC") {
      Object.assign(c, { last_message_at: later(c.last_message_at), updated_at: at });
    } else {
      Object.assign(c, { updated_at: at });
    }
    return { data: { ...msg, replayed: false }, error: null };
  }

  const openSession = (caseId: unknown, requester: unknown) => {
    let s = t("support_sessions").find((x) => x.case_id === caseId && (x.closed_at ?? null) === null);
    if (!s) {
      s = { id: randomUUID(), case_id: caseId, requester_user_id: requester, opened_at: now(), last_seen_at: now(), closed_at: null };
      t("support_sessions").push(s);
    }
    return s.id;
  };
  const event = (caseId: unknown, type: string, actor: unknown, payload: Row) =>
    t("support_case_events").push({ id: randomUUID(), case_id: caseId, event_type: type, actor_user_id: actor ?? null, payload, created_at: now() });

  function open(a: Record<string, unknown>): Res {
    const uid = a.p_requester_user_id;
    const sender = a.p_audience === "OWNER" ? "OWNER" : "MEMBER";
    const rid = (a.p_client_request_id as string | null | undefined) ?? null;
    if (rid) {
      const prev = t("support_messages").find((m) => m.client_request_id === rid);
      if (prev) {
        const c = t("support_cases").find((x) => x.id === prev.case_id);
        if (!c || c.requester_user_id !== uid || prev.sender_user_id !== uid) {
          return { data: null, error: { message: "support_request_id_conflict", code: "P0001" } };
        }
        const created = !t("support_messages").some((p) => p.case_id === prev.case_id && String(p.created_at) < String(prev.created_at));
        const s = t("support_sessions").find((x) => x.case_id === c.id && (x.closed_at ?? null) === null);
        return { data: { case: { ...c }, created, replayed: true, message: { ...prev }, session_id: s?.id ?? null }, error: null };
      }
    }
    const key = (r: Row) =>
      [r.requester_user_id, r.audience, r.category, r.owner_store_id ?? "", r.reference_type ?? "", r.reference_id ?? ""].join("|");
    const want = [uid, a.p_audience, a.p_category, a.p_owner_store_id ?? "", a.p_reference_type ?? "", a.p_reference_id ?? ""].join("|");
    const active = t("support_cases")
      .filter((c) => ACTIVE.includes(String(c.status)) && key(c) === want)
      .sort((x, y) => (String(x.last_message_at) < String(y.last_message_at) ? 1 : -1))[0];
    if (active) {
      const follow = String(a.p_followup_body ?? "").trim().slice(0, 8000);
      let msg: Row | null = null;
      if (follow) {
        const r = append({
          p_case_id: active.id,
          p_sender_type: sender,
          p_sender_user_id: uid,
          p_sender_admin_id: null,
          p_message_type: "PUBLIC",
          p_body: follow,
          p_system_seed: false,
          p_client_request_id: rid,
        });
        if (r.error) return r;
        msg = r.data as Row;
        if (a.p_issue_type != null && a.p_issue_type !== active.issue_type) {
          event(active.id, "followup_issue_selected", uid, { issue_type: a.p_issue_type, message_id: msg.id });
        }
      }
      const sid = openSession(active.id, uid);
      return { data: { case: { ...active }, created: false, replayed: false, message: msg, session_id: sid }, error: null };
    }
    const first = String(a.p_first_body ?? "").trim().slice(0, 8000);
    if (!first) return { data: null, error: { message: "support_open_empty_body", code: "22023" } };
    const at = now();
    const c: Row = {
      id: randomUUID(),
      created_at: at,
      public_case_no: `SC-${++seq}`,
      audience: a.p_audience,
      requester_user_id: uid,
      owner_store_id: a.p_owner_store_id ?? null,
      category: a.p_category,
      issue_type: a.p_issue_type ?? null,
      subject: a.p_subject ?? "",
      source_surface: a.p_source_surface ?? "",
      reference_type: a.p_reference_type ?? null,
      reference_id: a.p_reference_id ?? null,
      initial_summary: a.p_initial_summary ?? null,
      guidance_key: a.p_guidance_key ?? null,
      guidance_revision: a.p_guidance_revision ?? null,
      guidance_outcome: a.p_guidance_outcome ?? null,
      status: "OPEN",
      priority: "NORMAL",
      assigned_admin_id: null,
      previous_case_id: null,
      admin_unread_count: a.p_first_is_seed ? 1 : 0,
      requester_unread_count: 0,
      first_admin_response_at: null,
      resolved_at: null,
      archived_at: null,
      last_message_at: at,
      updated_at: at,
    };
    t("support_cases").push(c);
    const sid = openSession(c.id, uid);
    const r = append({
      p_case_id: c.id,
      p_sender_type: sender,
      p_sender_user_id: uid,
      p_sender_admin_id: null,
      p_message_type: "PUBLIC",
      p_body: first,
      p_system_seed: a.p_first_is_seed === true,
      p_client_request_id: rid,
    });
    if (r.error) return r;
    event(c.id, "case_created", uid, (a.p_event_payload as Row) ?? {});
    return { data: { case: { ...c }, created: true, replayed: false, message: r.data, session_id: sid }, error: null };
  }

  function transition(a: Record<string, unknown>): Res {
    const c = t("support_cases").find((x) => x.id === a.p_case_id);
    const out = (o: Row): Res => ({ data: o, error: null });
    if (!c) return out({ ok: false, error: "not_found", changed: false });
    const prevStatus = c.status;
    const prevAssignee = c.assigned_admin_id ?? null;
    const at = now();
    const active = ACTIVE.includes(String(c.status));
    const closed = CLOSED.includes(String(c.status));
    const seenChanged = a.p_seen_last_message_at != null && ms(c.last_message_at) !== ms(a.p_seen_last_message_at);
    const okSame = () => out({ ok: true, changed: false, case: { ...c }, previous_status: prevStatus, previous_assignee: prevAssignee });
    const err = (e: string) => out({ ok: false, error: e, changed: false, case: { ...c } });
    const closeSessions = () => {
      for (const s of t("support_sessions")) if (s.case_id === c.id && (s.closed_at ?? null) === null) Object.assign(s, { closed_at: at, last_seen_at: at });
    };
    /** SQL 과 같음 — 종료·재오픈 고객 알림 안전망 행(같은 트랜잭션 · source_key 유일 · 첫 시도는 backoff 뒤) */
    const requesterSafetyNet = (type: string, dedupeKey: string) => {
      const sourceKey = `requester:${dedupeKey}`;
      if (t("admin_notification_outbox").some((o) => o.source_key === sourceKey)) return;
      t("admin_notification_outbox").push({
        id: `ob-${t("admin_notification_outbox").length + 1}`,
        source_key: sourceKey,
        kind: "support_requester_notification",
        status: "pending",
        attempts: 1,
        last_error: "inline_first",
        payload: {
          kind: "support_requester_notification",
          deferred: true,
          type,
          caseId: c.id,
          requesterUserId: c.requester_user_id,
          actorUserId: a.p_actor_user_id ?? null,
          dedupeKey,
        },
      });
    };
    const action = String(a.p_action);
    switch (action) {
      case "admin_resolve":
        if (closed) return okSame();
        if (seenChanged) return err("case_updated");
        Object.assign(c, { status: "RESOLVED", resolved_at: at, updated_at: at, admin_unread_count: 0 });
        closeSessions();
        event(c.id, "status_changed", a.p_actor_user_id, { status: "RESOLVED" });
        requesterSafetyNet("support_case_resolved", `support_case_resolved:${c.id}:${String(c.resolved_at)}`);
        break;
      case "requester_close":
        if (c.requester_user_id !== a.p_actor_user_id) return out({ ok: false, error: "forbidden", changed: false });
        if (closed) return okSame();
        if (c.status !== "WAITING_USER") return err("invalid_transition");
        if (seenChanged) return err("case_updated");
        Object.assign(c, { status: "RESOLVED", resolved_at: at, updated_at: at, requester_unread_count: 0, admin_unread_count: 0 });
        closeSessions();
        event(c.id, "status_changed", a.p_actor_user_id, { status: "RESOLVED", by: "requester" });
        break;
      case "auto_close":
        if (c.status !== "WAITING_USER" || seenChanged) return okSame();
        Object.assign(c, { status: "RESOLVED", resolved_at: at, updated_at: at, admin_unread_count: 0 });
        closeSessions();
        event(c.id, "status_changed", null, { status: "RESOLVED", by: "auto_7d" });
        break;
      case "archive":
        if (c.status === "ARCHIVED") return okSame();
        if (c.status !== "RESOLVED") return err("not_closed");
        Object.assign(c, { status: "ARCHIVED", archived_at: at, updated_at: at, admin_unread_count: 0 });
        event(c.id, "status_changed", a.p_actor_user_id, { status: "ARCHIVED" });
        break;
      case "unarchive":
        if (c.status === "RESOLVED") return okSame();
        if (c.status !== "ARCHIVED") return err("invalid_transition");
        Object.assign(c, { status: "RESOLVED", archived_at: null, updated_at: at });
        event(c.id, "status_changed", a.p_actor_user_id, { status: "RESOLVED" });
        break;
      case "reopen": {
        if (active) return okSame();
        const keyOf = (r: Row) => [r.requester_user_id, r.audience, r.category, r.owner_store_id ?? "", r.reference_type ?? "", r.reference_id ?? ""].join("|");
        if (t("support_cases").some((x) => x !== c && ACTIVE.includes(String(x.status)) && keyOf(x) === keyOf(c))) {
          return out({ ok: false, error: "active_case_exists", changed: false });
        }
        Object.assign(c, { status: "OPEN", resolved_at: null, archived_at: null, updated_at: at, last_message_at: at });
        openSession(c.id, c.requester_user_id);
        event(c.id, "reopened", a.p_actor_user_id, {});
        if (a.p_actor_user_id !== c.requester_user_id) {
          requesterSafetyNet("support_case_reopened", `support_case_reopened:${c.id}:${String(c.last_message_at)}`);
        }
        break;
      }
      case "assign":
        if (closed) return err("case_closed");
        if ((c.assigned_admin_id ?? null) === (a.p_assignee ?? null)) return okSame();
        if ((c.assigned_admin_id ?? null) !== (a.p_expected_assignee ?? null)) return err("case_updated");
        Object.assign(c, { assigned_admin_id: a.p_assignee ?? null, updated_at: at });
        event(c.id, "assigned", a.p_actor_user_id, { assigned_admin_id: a.p_assignee ?? null, previous_assignee: prevAssignee });
        break;
      case "priority":
        if (!["NORMAL", "HIGH", "URGENT"].includes(String(a.p_priority))) return out({ ok: false, error: "invalid_priority", changed: false });
        if (closed) return err("case_closed");
        if (c.priority === a.p_priority) return okSame();
        Object.assign(c, { priority: a.p_priority, updated_at: at });
        event(c.id, "priority_changed", a.p_actor_user_id, { priority: a.p_priority });
        break;
      default:
        return out({ ok: false, error: "invalid_action", changed: false });
    }
    if (["admin_resolve", "requester_close", "auto_close", "archive"].includes(action)) {
      for (const n of t("admin_notifications")) {
        if (
          n.work_ref_table === "support_cases" &&
          n.work_ref_id === c.id &&
          ["support_customer_replied", "support_case_assigned"].includes(String(n.kind)) &&
          (n.read_at ?? null) === null
        ) {
          n.read_at = at;
        }
      }
    }
    return out({ ok: true, changed: true, case: { ...c }, previous_status: prevStatus, previous_assignee: prevAssignee });
  }

  return function rpc(name: string, args: Record<string, unknown> = {}): Res | null {
    if (name === "allocate_support_public_case_no") return { data: `SC-${++seq}`, error: null };
    if (name === "support_append_message") return append(args);
    if (name === "support_open_case") return open(args);
    if (name === "support_transition_case") return transition(args);
    return null;
  };
}
