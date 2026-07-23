/**
 * GET /api/messenger/domain-read/trade-list
 */
import { NextResponse } from "next/server";
import { withDomainBootstrapAuth } from "@/lib/messenger/contracts/phase6-api-route";
import { resolveDomainReadSurfaceAccess } from "@/lib/messenger/contracts/domain-read-surface-canary";
import { composeDomainReadTradeListDto } from "@/lib/messenger/contracts/domain-read-trade-list-compose";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await withDomainBootstrapAuth();
  if (!auth.ok) return auth.response;

  const access = resolveDomainReadSurfaceAccess({
    authenticatedUserId: auth.userId,
    bundle: "trade",
  });
  if (!access.ok) {
    return NextResponse.json(
      {
        error: access.code,
        code: access.code,
        reason: access.reason,
        surface: "legacy",
        bundle: "trade",
      },
      { status: access.status }
    );
  }

  const composed = await composeDomainReadTradeListDto(access.viewerUserId);
  if (!composed.ok) {
    return NextResponse.json(
      {
        error: "dibay_domain_read_trade_list_rollback",
        code: "dibay_domain_read_trade_list_rollback",
        trigger: composed.trigger,
        detail: composed.error ?? null,
        surface: "legacy",
        bundle: "trade",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(composed.dto);
}
