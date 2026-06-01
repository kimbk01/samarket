import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { buildStorePointAccountInquiryCopy } from "@/lib/stores/store-point-account-inquiry-defaults";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INQUIRY_TYPES = new Set(["general", "store_ops", "store_point", "settlement", "ad"]);
const INQUIRY_KINDS = new Set(["general", "account_request", "charge_followup"]);

type PostBody = {
  inquiry_type?: string;
  inquiry_kind?: string;
  subject?: string;
  content?: string;
  attachment_urls?: string[];
  related_charge_request_id?: string;
};

function isMissingInquiryKindColumn(msg: string): boolean {
  return /inquiry_kind/i.test(msg) && /(does not exist|column)/i.test(msg);
}

/** POST /api/me/stores/[storeId]/platform-inquiries — 매장 → DIBAY 관리자 문의 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const rawKind = String(body.inquiry_kind ?? "general").trim();
  const inquiry_kind = INQUIRY_KINDS.has(rawKind) ? rawKind : "general";

  const rawType = String(body.inquiry_type ?? "store_ops").trim();
  let inquiry_type = INQUIRY_TYPES.has(rawType) ? rawType : "store_ops";
  if (inquiry_kind === "account_request") {
    inquiry_type = "store_point";
  }

  let subject = String(body.subject ?? "").trim();
  let content = String(body.content ?? "").trim();

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  if (inquiry_kind === "account_request") {
    const { data: profile } = await sb
      .from("profiles")
      .select("preferred_language")
      .eq("id", userId)
      .maybeSingle();
    const language = normalizeAppLanguage(
      (profile as { preferred_language?: unknown } | null)?.preferred_language
    );
    const copy = buildStorePointAccountInquiryCopy(language ?? DEFAULT_APP_LANGUAGE);
    subject = copy.subject;
    content = copy.content;

    const { data: existingOpen, error: openErr } = await sb
      .from("platform_admin_inquiries")
      .select("id")
      .eq("store_id", sid)
      .eq("inquiry_type", "store_point")
      .eq("inquiry_kind", "account_request")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (openErr && !isMissingInquiryKindColumn(openErr.message ?? "")) {
      if (/platform_admin_inquiries/i.test(openErr.message) && /does not exist/i.test(openErr.message)) {
        return NextResponse.json({ ok: false, error: "platform_inquiries_table_missing" }, { status: 503 });
      }
    } else if (existingOpen?.id) {
      return NextResponse.json({ ok: false, error: "account_inquiry_already_open" }, { status: 409 });
    }
  } else if (!subject || !content) {
    return NextResponse.json({ ok: false, error: "subject_and_content_required" }, { status: 400 });
  }

  const attachments = Array.isArray(body.attachment_urls)
    ? body.attachment_urls.map((u) => String(u).trim()).filter(Boolean).slice(0, 10)
    : [];

  const insertPayload: Record<string, unknown> = {
    inquiry_type,
    store_id: sid,
    from_user_id: userId,
    subject: subject.slice(0, 200),
    content: content.slice(0, 8000),
    attachment_urls: attachments,
    status: "open",
    related_charge_request_id: body.related_charge_request_id?.trim() || null,
  };
  if (inquiry_kind !== "general") {
    insertPayload.inquiry_kind = inquiry_kind;
  }

  let { data, error } = await sb
    .from("platform_admin_inquiries")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (error && isMissingInquiryKindColumn(error.message ?? "")) {
    delete insertPayload.inquiry_kind;
    ({ data, error } = await sb
      .from("platform_admin_inquiries")
      .insert(insertPayload)
      .select("id")
      .maybeSingle());
  }

  if (error) {
    if (/platform_admin_inquiries/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: false, error: "platform_inquiries_table_missing" }, { status: 503 });
    }
    if (/uq_platform_admin_inquiries_open_account_per_store/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "account_inquiry_already_open" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

/** GET — 오너: 본인 매장 플랫폼 문의 목록 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data, error } = await sb
    .from("platform_admin_inquiries")
    .select(
      "id, inquiry_type, inquiry_kind, subject, content, status, answer, answered_at, created_at"
    )
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (/platform_admin_inquiries/i.test(error.message)) {
      return NextResponse.json({ ok: true, inquiries: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inquiries: data ?? [] });
}
