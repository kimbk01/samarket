import { NextRequest } from "next/server";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";
import { getMessengerMonitoringSummary } from "@/lib/community-messenger/monitoring/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return jsonErrorWithRequest(req, "not_found", 404);
  }

  return jsonOkWithRequest(req, {
    summary: getMessengerMonitoringSummary(),
  });
}
