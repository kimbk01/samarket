import { NextResponse } from "next/server";
import { signedLivePackFiles } from "@/lib/dibay-intro/pack/persist-live-pack";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pack = await signedLivePackFiles();
    if (!pack) return NextResponse.json({ ok: true, live: false });
    return NextResponse.json({ ok: true, live: true, ...pack });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}
