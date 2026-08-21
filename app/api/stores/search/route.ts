import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { searchDeliveryDomain } from "@/lib/delivery/search/search-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const userId = await getRouteUserId();
  const result = await searchDeliveryDomain({
    q,
    storeLimit: 10,
    menuLimit: 20,
    userId,
  });
  return NextResponse.json(result);
}
