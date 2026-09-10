import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createCommunityCrawlSource,
  listCommunityCrawlSources,
} from "@/lib/community-crawler/admin-crawl-store";
import type {
  CommunityCrawlPolicyStatus,
  CommunityCrawlSourceStatus,
  CommunityCrawlType,
} from "@/lib/community-crawler/crawl-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }
  try {
    const sources = await listCommunityCrawlSources(sb);
    return NextResponse.json({ ok: true, sources });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let body: {
    name?: string;
    base_url?: string;
    status?: CommunityCrawlSourceStatus;
    crawler_type?: CommunityCrawlType;
    adapter_key?: string | null;
    policy_status?: CommunityCrawlPolicyStatus;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const source = await createCommunityCrawlSource(sb, {
      name: String(body.name ?? ""),
      base_url: String(body.base_url ?? ""),
      status: body.status,
      crawler_type: body.crawler_type,
      adapter_key: body.adapter_key,
      policy_status: body.policy_status,
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status =
      message === "name_required" || message === "invalid_base_url" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
