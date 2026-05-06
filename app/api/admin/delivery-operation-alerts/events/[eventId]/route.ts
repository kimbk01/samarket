import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimNote(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().slice(0, max);
  return t.length ? t : null;
}

type ActionBody = {
  action: "acknowledge" | "resolve" | "mute" | "assign" | "unassign" | "handling";
  note?: string;
  assignment_note?: string;
  assigned_admin_id?: string | null;
  handling_note?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { eventId } = await ctx.params;
  const id = String(eventId ?? "").trim();
  if (!id) return NextResponse.json({ error: "invalid_event_id" }, { status: 400 });

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = body.action;
  const allowed = ["acknowledge", "resolve", "mute", "assign", "unassign", "handling"] as const;
  if (!allowed.includes(action as (typeof allowed)[number])) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const sbAny = sb as any;
  const nowIso = new Date().toISOString();
  const uid = admin.userId;

  const { data: existing, error: loadErr } = await sbAny
    .from("delivery_operation_alert_events")
    .select("id, event_status")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message ?? "load_failed" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  const st = String((existing as { event_status?: string }).event_status ?? "");

  let patch: Record<string, unknown> = {};

  if (action === "handling") {
    const hn = trimNote(body.handling_note, 2000);
    if (hn == null) return NextResponse.json({ error: "handling_note_required" }, { status: 400 });
    patch = { handling_note: hn };
    if (st === "resolved") {
      return NextResponse.json({ error: "cannot_edit_resolved" }, { status: 409 });
    }
  } else if (action === "assign") {
    const aid = String(body.assigned_admin_id ?? "").trim();
    if (!aid) return NextResponse.json({ error: "assigned_admin_id_required" }, { status: 400 });
    patch = {
      assigned_admin_id: aid,
      assigned_at: nowIso,
      assignment_note: trimNote(body.assignment_note, 600),
    };
    if (st === "resolved") {
      return NextResponse.json({ error: "cannot_assign_resolved" }, { status: 409 });
    }
  } else if (action === "unassign") {
    patch = {
      assigned_admin_id: null,
      assigned_at: null,
      assignment_note: null,
    };
    if (st === "resolved") {
      return NextResponse.json({ error: "cannot_unassign_resolved" }, { status: 409 });
    }
  } else if (action === "acknowledge") {
    if (st !== "open") {
      return NextResponse.json({ error: "acknowledge_requires_open" }, { status: 409 });
    }
    patch = {
      event_status: "acknowledged",
      acknowledged_at: nowIso,
      acknowledged_by: uid,
      acknowledge_note: trimNote(body.note, 600),
      escalation_count: 0,
      escalated_at: null,
    };
  } else if (action === "mute") {
    if (st !== "open" && st !== "acknowledged") {
      return NextResponse.json({ error: "mute_requires_open_or_ack" }, { status: 409 });
    }
    patch = {
      event_status: "muted",
      acknowledged_at: nowIso,
      acknowledged_by: uid,
      mute_note: trimNote(body.note, 600),
    };
  } else if (action === "resolve") {
    if (st === "resolved") {
      const { data: row } = await sbAny
        .from("delivery_operation_alert_events")
        .select(
          "id, event_status, acknowledged_at, resolved_at, acknowledged_by, resolved_by, assigned_admin_id, escalation_count"
        )
        .eq("id", id)
        .maybeSingle();
      return NextResponse.json({ ok: true, event: row ?? existing });
    }
    patch = {
      event_status: "resolved",
      resolved_at: nowIso,
      resolved_by: uid,
      resolve_note: trimNote(body.note, 600),
    };
  }

  const selectCols =
    "id, event_status, acknowledged_at, resolved_at, acknowledged_by, resolved_by, assigned_admin_id, assigned_at, assignment_note, escalation_count, escalated_at, handling_note, acknowledge_note, resolve_note, mute_note, repeat_fire_count";

  const finalPatch = { ...patch, mutation_actor_id: uid };

  const { data, error } = await sbAny
    .from("delivery_operation_alert_events")
    .update(finalPatch)
    .eq("id", id)
    .select(selectCols)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message ?? "update_failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, event: data });
}
