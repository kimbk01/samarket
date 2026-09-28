import { NextRequest } from "next/server";
import { jsonWithRequestIdHeader } from "@/lib/http/api-route";
import { resolveGlobalSearchTradeMatchOnly } from "@/lib/search/global/trade-match-only-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await resolveGlobalSearchTradeMatchOnly(req);
  return jsonWithRequestIdHeader(req, data);
}
