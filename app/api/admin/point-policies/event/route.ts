import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  listPointEventPolicies,
  savePointEventPolicyDb,
  setPointEventPolicyActiveDb,
} from "@/lib/points/point-policy-db";
import type { PointEventPolicy } from "@/lib/types/point-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const policies = await listPointEventPolicies(gate.sb);
    return NextResponse.json({ ok: true, policies });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as Partial<PointEventPolicy> & {
    setActive?: { id: string; isActive: boolean };
  };
  try {
    if (body.setActive) {
      const policy = await setPointEventPolicyActiveDb(
        gate.sb,
        body.setActive.id,
        body.setActive.isActive
      );
      if (!policy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      await addPointPolicyLogDb(gate.sb, {
        policyType: "event_policy",
        relatedId: body.setActive.id,
        actionType: body.setActive.isActive ? "activate" : "deactivate",
        adminId: gate.actor.userId,
        adminNickname: gate.actor.profile.nickname ?? "",
        note: body.setActive.isActive ? "활성화" : "비활성화",
      });
      return NextResponse.json({ ok: true, policy });
    }
    const saved = await savePointEventPolicyDb(gate.sb, body as PointEventPolicy);
    await addPointPolicyLogDb(gate.sb, {
      policyType: "event_policy",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: body.id ? "이벤트 정책 수정" : "이벤트 정책 생성",
    });
    return NextResponse.json({ ok: true, policy: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
