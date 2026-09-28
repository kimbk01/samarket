import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseIntroPackManifest } from "@/lib/dibay-intro/pack/manifest";

export type LocalPackPhase = "STAGING" | "VERIFYING" | "READY";

export type LocalPackInstallResult =
  | { ok: true; phase: "READY"; readyDir: string }
  | { ok: false; phase: "STAGING" | "VERIFYING"; reason: string; readyDir: string | null };

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function writeTree(root: string, files: Map<string, Buffer>): void {
  for (const [rel, bytes] of files) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
}

function verifyPackDir(dir: string): { ok: true } | { ok: false; reason: string } {
  const manifestPath = join(dir, "manifest.json");
  const enginePath = join(dir, "engine.js");
  const documentPath = join(dir, "document.json");
  const fontPath = join(dir, "fonts/PretendardVariable.woff2");
  if (!existsSync(manifestPath)) return { ok: false, reason: "missing_manifest" };
  if (!existsSync(enginePath)) return { ok: false, reason: "missing_engine" };
  if (!existsSync(documentPath)) return { ok: false, reason: "missing_document" };
  if (!existsSync(fontPath)) return { ok: false, reason: "missing_font" };
  let parsed: ReturnType<typeof parseIntroPackManifest>;
  try {
    parsed = parseIntroPackManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  } catch {
    return { ok: false, reason: "manifest_parse" };
  }
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const engineHash = sha(readFileSync(enginePath));
  if (engineHash !== parsed.manifest.engineHash) return { ok: false, reason: "engine_hash_mismatch" };
  for (const item of parsed.manifest.media) {
    const file = join(dir, item.file);
    if (!existsSync(file)) return { ok: false, reason: `missing_media:${item.id}` };
    if (sha(readFileSync(file)) !== item.checksum) return { ok: false, reason: `media_checksum:${item.id}` };
  }
  return { ok: true };
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..`));
}

/**
 * STAGING → VERIFYING → READY atomic swap.
 * Previous READY remains until the replacement is fully READY.
 */
export function installLocalIntroPack(input: {
  rootDir: string;
  files: Map<string, Buffer>;
}): LocalPackInstallResult {
  const readyDir = join(input.rootDir, "ready");
  const stagingDir = join(input.rootDir, "staging");
  const prevDir = join(input.rootDir, "ready.prev");
  const nextDir = join(input.rootDir, "ready.next");
  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(nextDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  writeTree(stagingDir, input.files);
  const verified = verifyPackDir(stagingDir);
  if (!verified.ok) {
    rmSync(stagingDir, { recursive: true, force: true });
    return {
      ok: false,
      phase: "VERIFYING",
      reason: verified.reason,
      readyDir: existsSync(join(readyDir, "READY")) ? readyDir : null,
    };
  }
  writeFileSync(join(stagingDir, "READY"), Buffer.from("READY", "utf8"));
  rmSync(nextDir, { recursive: true, force: true });
  renameSync(stagingDir, nextDir);
  if (existsSync(readyDir)) {
    rmSync(prevDir, { recursive: true, force: true });
    renameSync(readyDir, prevDir);
  }
  renameSync(nextDir, readyDir);
  rmSync(prevDir, { recursive: true, force: true });
  if (!existsSync(join(readyDir, "READY")) || !isInside(input.rootDir, readyDir)) {
    return { ok: false, phase: "VERIFYING", reason: "ready_marker_missing", readyDir: null };
  }
  return { ok: true, phase: "READY", readyDir };
}

export function localPackPhase(rootDir: string): LocalPackPhase | "NONE" {
  if (existsSync(join(rootDir, "ready", "READY"))) return "READY";
  if (existsSync(join(rootDir, "staging"))) return "STAGING";
  return "NONE";
}
