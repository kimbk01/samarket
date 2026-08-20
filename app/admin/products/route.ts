import { NextRequest, NextResponse } from "next/server";

/** Duplicate list surface — HTTP 307. RSC redirect() is 200+CSR bailout in this Next tree. */
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/admin/posts-management", req.url), 307);
}
