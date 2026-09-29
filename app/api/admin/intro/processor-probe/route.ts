/**
 * Isolated deployed processor probe — C-R1 sharp+omggif host proof.
 * Does NOT create product Media authority.
 * Auth: requireAdmin OR x-intro-processor-probe matching INTRO_PROCESSOR_PROBE_SECRET.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { processGifB2 } from "@/lib/intro/media/processor/gif-b2";
import { sha256Hex } from "@/lib/intro/media/integrity";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIXTURES = [
  "01_normal_multiframe",
  "02_transparent",
  "03_looping",
  "04_varied_delay",
  "05_disposal_sensitive",
] as const;

const EXPECTED_05 = {
  frames: 3,
  delays: [120, 120, 120] as const,
  pageHashPrefixes: ["32d8f02d9c51", "869735cd4e96", "7055f6668fde"] as const,
};

function authorizeProbe(req: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const secret = process.env.INTRO_PROCESSOR_PROBE_SECRET?.trim();
  const header = req.headers.get("x-intro-processor-probe")?.trim();
  if (secret && header && header === secret) {
    return { ok: true };
  }
  return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
}

async function metaOf(buf: Buffer) {
  const m = await sharp(buf, { animated: true, limitInputPixels: false }).metadata();
  return {
    frameCount: m.pages ?? 1,
    delays: Array.isArray(m.delay) ? [...m.delay] : Array(m.pages ?? 1).fill(m.delay ?? 100),
    loop: m.loop ?? 0,
    width: m.width ?? 0,
    height: m.pageHeight || m.height || 0,
  };
}

async function pagePrefixes(buf: Buffer): Promise<string[]> {
  const m = await sharp(buf, { animated: true, limitInputPixels: false }).metadata();
  const out: string[] = [];
  for (let i = 0; i < (m.pages ?? 1); i++) {
    const png = await sharp(buf, { animated: true, page: i, limitInputPixels: false })
      .png()
      .toBuffer();
    out.push(sha256Hex(png).slice(0, 12));
  }
  return out;
}

export async function POST(req: NextRequest) {
  // Prefer admin session; fall back to internal probe secret (not public).
  const admin = await requireAdminApiUser();
  if (!admin.ok) {
    const probe = authorizeProbe(req);
    if (!probe.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const results: Array<Record<string, unknown>> = [];
  let firstDivergence: string | null = null;

  for (const id of FIXTURES) {
    const path = join(process.cwd(), "fixtures/intro/gif", `${id}.gif`);
    let src: Buffer;
    try {
      src = readFileSync(path);
    } catch (cause) {
      firstDivergence ??= `fixture_missing:${id}`;
      results.push({ id, pass: false, error: "fixture_missing", cause: String(cause) });
      continue;
    }

    const sourceMeta = await metaOf(src);
    const sourcePrefixes = await pagePrefixes(src);

    let processed;
    try {
      processed = await processGifB2(src);
    } catch (err) {
      firstDivergence ??= `process_failed:${id}:${err instanceof Error ? err.message : String(err)}`;
      results.push({
        id,
        pass: false,
        source: { ...sourceMeta, pageHashPrefixes: sourcePrefixes },
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const outMeta = await metaOf(processed.bytes);
    const outPrefixes = await pagePrefixes(processed.bytes);
    const out2 = await processGifB2(src);
    const deterministic =
      sha256Hex(processed.bytes) === sha256Hex(out2.bytes);

    let pass =
      outMeta.frameCount === sourceMeta.frameCount &&
      outMeta.frameCount > 1 &&
      JSON.stringify(outMeta.delays) === JSON.stringify(sourceMeta.delays) &&
      outMeta.loop === sourceMeta.loop &&
      outMeta.width === sourceMeta.width &&
      outMeta.height === sourceMeta.height &&
      deterministic &&
      new Set(outPrefixes).size === outMeta.frameCount;

    if (id === "05_disposal_sensitive") {
      const f05 =
        outMeta.frameCount === EXPECTED_05.frames &&
        JSON.stringify(outMeta.delays) === JSON.stringify([...EXPECTED_05.delays]) &&
        JSON.stringify(outPrefixes) === JSON.stringify([...EXPECTED_05.pageHashPrefixes]);
      pass = pass && f05;
      if (!f05 && !firstDivergence) {
        firstDivergence = `fixture_05_divergence:frames=${outMeta.frameCount},delays=${JSON.stringify(outMeta.delays)},hashes=${JSON.stringify(outPrefixes)}`;
      }
    }

    if (!pass && !firstDivergence) {
      firstDivergence = `fixture_fail:${id}`;
    }

    results.push({
      id,
      pass,
      source: {
        frameCount: sourceMeta.frameCount,
        delays: sourceMeta.delays,
        loop: sourceMeta.loop,
        width: sourceMeta.width,
        height: sourceMeta.height,
        pageHashPrefixes: sourcePrefixes,
      },
      processed: {
        frameCount: outMeta.frameCount,
        delays: outMeta.delays,
        loop: outMeta.loop,
        width: outMeta.width,
        height: outMeta.height,
        pageHashPrefixes: outPrefixes,
        byteLength: processed.byteLength,
        integrity: `sha256:${sha256Hex(processed.bytes)}`,
        animated: outMeta.frameCount > 1,
      },
      deterministic,
      animation: outMeta.frameCount > 1,
    });
  }

  const allPass = results.every((r) => r.pass === true);
  const host = allPass ? "PASS" : "PROCESSOR_HOST_BLOCKED";

  return NextResponse.json({
    ok: allPass,
    host,
    stack: "sharp animated decode/composite + omggif.GifWriter",
    forbidden: "sharp+cgif",
    runtime: {
      node: process.version,
      vercel: Boolean(process.env.VERCEL),
      region: process.env.VERCEL_REGION ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    firstDivergence,
    results,
  });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed", hint: "POST only" },
    { status: 405 },
  );
}
