import { NextResponse } from "next/server";
import { searchDeliveryDomain } from "@/lib/delivery/search/search-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const result = await searchDeliveryDomain({ q, storeLimit: 10, menuLimit: 20 });
  return NextResponse.json(result);
}

