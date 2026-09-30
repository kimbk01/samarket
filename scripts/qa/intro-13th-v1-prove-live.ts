/**
 * OBSOLETE_13TH_QA — LIVE_MUTATION_RETIRED
 *
 * R14 PRECHECK-B: direct setLiveRelease from QA scripts is forbidden.
 * This script may still prove publish/pack sealing for historical fixtures,
 * but MUST NOT establish or replace Owner Live.
 *
 * Owner Live mutation: canonical Apply only (`applyIntroServiceFromDraft`).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { uploadAndReadyIntroMedia } from "../../lib/intro/media/service";
import { publishIntroDocument } from "../../lib/intro/publish/service";
import {
  cryptoRandomId,
  DEFAULT_MOTION,
  type IntroDocumentV1,
} from "../../lib/intro/contracts/document";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  let v = line.slice(i + 1);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[line.slice(0, i)] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  mkdirSync(".tmp/intro-13th-v1", { recursive: true });
  const userId = "11111111-1111-1111-1111-111111111111";

  // Minimal 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const media = await uploadAndReadyIntroMedia(sb, {
    bytes: png,
    contentType: "image/png",
    originalFileName: "v1-prove.png",
    userId,
  });

  const document: IntroDocumentV1 = {
    schemaVersion: 1,
    documentId: cryptoRandomId(),
    title: "DIBAY-13-V1-IMAGE",
    scenes: [
      {
        sceneId: cryptoRandomId(),
        durationMs: 1200,
        background: { type: "COLOR", color: "#0F172A" },
        layers: [
          {
            layerId: cryptoRandomId(),
            type: "IMAGE",
            mediaId: media.mediaId,
            fit: "CONTAIN",
            motion: DEFAULT_MOTION,
          },
        ],
      },
    ],
  };

  const { data: doc, error: dErr } = await sb
    .from("app_intro_documents")
    .insert({ title: document.title, draft_version: 1, document })
    .select("document_id, draft_version")
    .single();
  if (dErr) throw dErr;

  const published = await publishIntroDocument(sb, {
    documentId: doc.document_id,
    userId,
    idempotencyKey: `v1_prove_${Date.now()}`,
  });
  console.log("published", published);

  // LIVE_MUTATION_RETIRED — do not call setLiveRelease.
  const proof = {
    classification: "OBSOLETE_13TH_QA",
    liveMutation: "RETIRED",
    documentId: doc.document_id,
    mediaId: media.mediaId,
    releaseId: published.releaseId,
    packageId: published.packageId,
    packageIntegrity: published.packageIntegrity,
    markerText: "DIBAY-13-V1-IMAGE",
    note: "Publish/pack only. Owner Live requires canonical Apply + OWNER content_class.",
  };
  writeFileSync(".tmp/intro-13th-v1/LIVE_V1_PROVE.json", JSON.stringify(proof, null, 2));
  console.log("PROOF", JSON.stringify(proof, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
