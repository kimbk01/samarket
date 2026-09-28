import { parseDibayIntroDocument } from "@/lib/dibay-intro/document";
import { resolveCtaRuntimeAction } from "@/lib/dibay-intro/engine/cta-action";
import { attachIntroPlayer } from "@/lib/dibay-intro/engine/player";
import { createBootstrapTraceBuffer, type DibayIntroBootstrapStep } from "@/lib/dibay-intro/pack/bootstrap";
import { parseIntroPackManifest } from "@/lib/dibay-intro/pack/manifest";

declare global {
  interface Window {
    DibayIntroHost?: {
      trace?: (payload: { step: string; result: string; reason?: string }) => void;
    };
  }
}

const buffer = createBootstrapTraceBuffer();
let currentStep: DibayIntroBootstrapStep = "PACK_OPEN";

function trace(step: DibayIntroBootstrapStep, result: "BEGIN" | "PASS" | "FAIL", reason?: string) {
  if (result === "BEGIN") currentStep = step;
  buffer.emit(step, result, reason);
  window.DibayIntroHost?.trace?.({ step, result, reason });
}

async function readJson(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}:${res.status}`);
  return res.json();
}

async function boot() {
  try {
    trace("PACK_OPEN", "BEGIN");
    trace("PACK_OPEN", "PASS");

    trace("MANIFEST_READ", "BEGIN");
    const rawManifest = await readJson("./manifest.json");
    trace("MANIFEST_READ", "PASS");

    trace("MANIFEST_PARSE", "BEGIN");
    const parsedManifest = parseIntroPackManifest(rawManifest);
    if (!parsedManifest.ok) {
      trace("MANIFEST_PARSE", "FAIL", parsedManifest.reason);
      return;
    }
    trace("MANIFEST_PARSE", "PASS");

    trace("ENGINE_VERIFY", "BEGIN");
    if (!parsedManifest.manifest.engineHash) {
      trace("ENGINE_VERIFY", "FAIL", "engine_hash_missing");
      return;
    }
    trace("ENGINE_VERIFY", "PASS");

    trace("DOCUMENT_VERIFY", "BEGIN");
    const documentRaw = await readJson("./document.json");
    const parsedDocument = parseDibayIntroDocument(documentRaw);
    if (!parsedDocument.ok) {
      trace("DOCUMENT_VERIFY", "FAIL", parsedDocument.issues[0]?.message ?? "document_invalid");
      return;
    }
    trace("DOCUMENT_VERIFY", "PASS");

    trace("ASSET_MAP", "BEGIN");
    const mediaUrlById: Record<string, string> = {};
    for (const item of parsedManifest.manifest.media) {
      mediaUrlById[item.id] = `./${item.file}`;
    }
    trace("ASSET_MAP", "PASS");

    trace("ASSET_VERIFY", "BEGIN");
    for (const item of parsedManifest.manifest.media) {
      const res = await fetch(`./${item.file}`);
      if (!res.ok) {
        trace("ASSET_VERIFY", "FAIL", `missing:${item.id}`);
        return;
      }
    }
    trace("ASSET_VERIFY", "PASS");

    trace("FONT_LOAD", "BEGIN");
    try {
      const face = new FontFace("Pretendard Variable", "url(./fonts/PretendardVariable.woff2)");
      await face.load();
      window.document.fonts.add(face);
      trace("FONT_LOAD", "PASS");
    } catch {
      trace("FONT_LOAD", "FAIL", "font_load");
      return;
    }

    trace("MEDIA_LOAD", "BEGIN");
    await Promise.all(Object.values(mediaUrlById).map((url) => fetch(url)));
    trace("MEDIA_LOAD", "PASS");

    trace("SCENE_BUILD", "BEGIN");
    const host = window.document.getElementById("stage");
    if (!host) {
      trace("SCENE_BUILD", "FAIL", "stage_missing");
      return;
    }
    trace("SCENE_BUILD", "PASS");

    trace("FIRST_LAYOUT", "BEGIN");
    const handle = attachIntroPlayer(host, {
      document: parsedDocument.document,
      mediaUrlById,
      mode: "runtime",
      interactive: true,
      onCta: (layer) => {
        const action = resolveCtaRuntimeAction(layer, parsedDocument.document, handle.getElapsedMs());
        if (action.kind === "CONTINUE") handle.seek(action.seekMs);
        if (action.kind === "FINISH") handle.pause();
      },
      onFirstFrame: () => {
        trace("FIRST_LAYOUT", "PASS");
        trace("FIRST_PAINT", "BEGIN");
        trace("FIRST_PAINT", "PASS");
        trace("INTRO_FIRST_FRAME_READY", "BEGIN");
        trace("INTRO_FIRST_FRAME_READY", "PASS");
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    if (!buffer.firstFailure()) {
      trace(currentStep, "FAIL", reason);
    }
  }
}

void boot();
