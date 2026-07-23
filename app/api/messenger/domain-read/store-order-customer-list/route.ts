/**
 * GET /api/messenger/domain-read/store-order-customer-list
 */
import { NextResponse } from "next/server";
import { withDomainBootstrapAuth } from "@/lib/messenger/contracts/phase6-api-route";
import { resolveDomainReadSurfaceAccess } from "@/lib/messenger/contracts/domain-read-surface-canary";
import { composeDomainReadStoreOrderCustomerListDto } from "@/lib/messenger/contracts/domain-read-store-order-customer-list-compose";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await withDomainBootstrapAuth();
  if (!auth.ok) return auth.response;

  const access = resolveDomainReadSurfaceAccess({
    authenticatedUserId: auth.userId,
    bundle: "store_order_customer",
  });
  if (!access.ok) {
    return NextResponse.json(
      {
        error: access.code,
        code: access.code,
        reason: access.reason,
        surface: "legacy",
        bundle: "store_order_customer",
      },
      { status: access.status }
    );
  }

  const composed = await composeDomainReadStoreOrderCustomerListDto(access.viewerUserId);
  if (!composed.ok) {
    return NextResponse.json(
      {
        error: "dibay_domain_read_so_customer_list_rollback",
        code: "dibay_domain_read_so_customer_list_rollback",
        trigger: composed.trigger,
        detail: composed.error ?? null,
        surface: "legacy",
        bundle: "store_order_customer",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(composed.dto);
}
