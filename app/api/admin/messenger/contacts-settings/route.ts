import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { CONTACTS_DISCOVERY_POLICIES, type ContactsDiscoveryPolicy } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  loadContactsAdminCounts,
  readContactsAdminSettings,
  saveContactsAdminSettingsCas,
} from "@/lib/community-messenger/contacts/contacts-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 연락처 동기화 운영 설정 + 현황 숫자 (번호·이름·변환값은 내보내지 않음) */
export async function GET() {
  if (!(await isRouteAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const r = await readContactsAdminSettings(sb);
  if (!r.ok) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  const counts = r.tableMissing ? null : await loadContactsAdminCounts(sb);
  return NextResponse.json(
    {
      ok: true,
      settings: r.settings,
      migrationApplied: !r.tableMissing,
      hmacKeyConfigured: String(process.env.CONTACTS_PHONE_HMAC_KEY ?? "").trim().length >= 32,
      counts,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function optInt(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

/** PUT — 저장 (최고관리자). 읽은 revision 으로만 저장, 다르면 409 (다른 관리자 저장을 덮어쓰지 않음). */
export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }
  const bools = ["enabled", "joinNoticeEnabled"] as const;
  for (const k of bools) {
    if (body[k] !== undefined && typeof body[k] !== "boolean") return NextResponse.json({ ok: false, error: `invalid_${k}` }, { status: 400 });
  }
  const ints = ["joinNoticeCap", "dailyNewNumberLimit", "requestNumberLimit", "idleSourceDays"] as const;
  const parsedInts: Record<string, number | null> = {};
  for (const k of ints) {
    const v = optInt(body[k]);
    if (v === undefined) return NextResponse.json({ ok: false, error: `invalid_${k}` }, { status: 400 });
    parsedInts[k] = v;
  }
  const policy = body.defaultDiscoveryPolicy;
  if (policy !== undefined && policy !== null && !(CONTACTS_DISCOVERY_POLICIES as readonly unknown[]).includes(policy)) {
    return NextResponse.json({ ok: false, error: "invalid_default_discovery_policy" }, { status: 400 });
  }
  const consentVersion = body.consentVersion;
  if (consentVersion !== undefined && consentVersion !== null && (typeof consentVersion !== "string" || !/^[A-Za-z0-9._-]{1,32}$/.test(consentVersion))) {
    return NextResponse.json({ ok: false, error: "invalid_consent_version" }, { status: 400 });
  }

  const before = await readContactsAdminSettings(gate.sb);
  const saved = await saveContactsAdminSettingsCas(gate.sb, {
    expectedRevision,
    enabled: (body.enabled as boolean | undefined) ?? null,
    joinNoticeEnabled: (body.joinNoticeEnabled as boolean | undefined) ?? null,
    joinNoticeCap: parsedInts.joinNoticeCap,
    dailyNewNumberLimit: parsedInts.dailyNewNumberLimit,
    requestNumberLimit: parsedInts.requestNumberLimit,
    idleSourceDays: parsedInts.idleSourceDays,
    defaultDiscoveryPolicy: (policy as ContactsDiscoveryPolicy | null | undefined) ?? null,
    consentVersion: (consentVersion as string | null | undefined) ?? null,
    actorId: gate.actor.userId,
  });
  if (!saved.ok) {
    const status = saved.error === "stale_revision" ? 409 : saved.error === "migration_not_applied" ? 503 : 400;
    return NextResponse.json({ ok: false, error: saved.error, currentRevision: saved.currentRevision ?? null }, { status });
  }
  const after = await readContactsAdminSettings(gate.sb);
  await appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "messenger_contacts_admin_settings",
    target_id: "1",
    action: "messenger_contacts.admin_settings.save",
    before_json: before.ok ? (before.settings as unknown as Record<string, unknown>) : null,
    after_json: after.ok ? (after.settings as unknown as Record<string, unknown>) : null,
  }).catch((e: unknown) => console.error("[admin contacts-settings] audit", e));
  return NextResponse.json({ ok: true, revision: saved.revision });
}
