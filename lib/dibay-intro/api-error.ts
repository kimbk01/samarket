import { NextResponse } from "next/server";

export function dibayIntroApiError(error: unknown, fallback = "failed") {
  const message = error instanceof Error ? error.message : fallback;
  if (message === "service_unavailable") {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }
  if (message === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (message === "not_published" || message === "publish_invalid" || message === "invalid_document") {
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  if (/does not exist|schema cache|relation/i.test(message)) {
    return NextResponse.json({ ok: false, error: "schema_missing" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
