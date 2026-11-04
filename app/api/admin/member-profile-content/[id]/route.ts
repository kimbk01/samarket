import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/member-profile-content/:id
 * 부적절한 프로필 사진·소개글 제재 — 값을 비우기만 한다(계정 상태·다른 필드 불변).
 * body: { avatar?: boolean; bio?: boolean; reason: string }
 * 감사 로그에는 원문을 남기지 않고 초기화한 필드명·사유만 기록한다.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { avatar?: unknown; bio?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const resetAvatar = body.avatar === true;
  const resetBio = body.bio === true;
  if (!resetAvatar && !resetBio) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const { sb } = gate;
  const { data: profile, error: readErr } = await sb
    .from("profiles")
    .select("id, avatar_url, bio")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = profile as { avatar_url?: string | null; bio?: string | null };
  const patch: Record<string, null> = {};
  if (resetAvatar) patch.avatar_url = null;
  if (resetBio) patch.bio = null;

  const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", userId);
  if (updateErr) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "member",
    target_id: userId,
    action: "admin_member_profile_content_reset",
    after_json: {
      fields: Object.keys(patch),
      had_avatar: Boolean(row.avatar_url),
      had_bio: Boolean(row.bio && String(row.bio).trim()),
      reason,
    },
  });

  return NextResponse.json({ ok: true, fields: Object.keys(patch) });
}
