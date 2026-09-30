/**
 * OBSOLETE_13TH_QA — LIVE_MUTATION_RETIRED
 *
 * R14 PRECHECK-B: this forensic must not call setLiveRelease / mutate Owner Live.
 * Publish + pack scene-count proof only.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publishIntroDocument } from "@/lib/intro/publish/service";
import { getIntroDocument } from "@/lib/intro/document/service";

const DOC = "d40b3f17-af89-482c-b381-c102064927fa";
const OUT = ".tmp/intro-13th-admin-app-forensic";
const HAS_SERVICE_ROLE = Boolean(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!HAS_SERVICE_ROLE)("intro forensic publish 1-scene (no Live)", () => {
  it("publishes draft and proves pack scene count without Live mutation", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url && key).toBeTruthy();
    const sb = createClient(url!, key!, { auth: { persistSession: false } });
    const userId = "e6e35c51-39a5-41d0-a95a-8294ed0b3da5";

    const draft = await getIntroDocument(sb, DOC);
    expect(draft).toBeTruthy();
    const sceneCount = (draft!.document as { scenes?: unknown[] }).scenes?.length ?? -1;
    expect(sceneCount).toBe(1);

    const published = await publishIntroDocument(sb, {
      documentId: DOC,
      userId,
      idempotencyKey: `forensic_scene2_delete_${draft!.draft_version}_${Date.now()}`,
    });

    const report = {
      classification: "OBSOLETE_13TH_QA",
      liveMutation: "LIVE_MUTATION_RETIRED",
      STORE_CLEAR_USED: "NO",
      draftVersion: draft!.draft_version,
      draftSceneCount: sceneCount,
      published,
      note: "setLiveRelease retired from this QA; Owner Live = canonical Apply only",
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/AFTER_PUBLISH_APPLY.json`, JSON.stringify(report, null, 2));
    expect(published.releaseId).toBeTruthy();
    expect(published.packageId).toBeTruthy();
  }, 120_000);
});
