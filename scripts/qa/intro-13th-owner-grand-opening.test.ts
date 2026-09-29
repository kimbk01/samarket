/**
 * Owner fixture via Admin document services (same code path as Admin APIs).
 * Run: npx vitest run scripts/qa/intro-13th-owner-grand-opening.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { uploadAndReadyIntroMedia } from "@/lib/intro/media/service";
import {
  createIntroDocument,
  saveIntroDocument,
} from "@/lib/intro/document/service";
import { publishIntroDocument } from "@/lib/intro/publish/service";
import { setLiveRelease } from "@/lib/intro/live/service";
import {
  cryptoRandomId,
  type IntroDocumentV1,
} from "@/lib/intro/contracts/document";

const OUT = ".tmp/intro-13th-owner-cms";
const TITLE = "DIBAY GRAND OPENING";
const USER = "11111111-1111-1111-1111-111111111111";

function loadEnv(): Record<string, string> {
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
  return env;
}

describe("intro 13th owner grand opening fixture", () => {
  it(
    "creates publishes and applies DIBAY GRAND OPENING via admin services",
    async () => {
      mkdirSync(OUT, { recursive: true });
      const env = loadEnv();
      const sb = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL!,
        env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );

      const png = readFileSync(".tmp/intro-13th-v1/owner-marker-image.png");
      const imageMedia = await uploadAndReadyIntroMedia(sb, {
        bytes: png,
        originalName: "grand-opening-hero.png",
        userId: USER,
      });
      const logoMedia = await uploadAndReadyIntroMedia(sb, {
        bytes: png,
        originalName: "grand-opening-logo.png",
        userId: USER,
      });

      const created = await createIntroDocument(sb, {
        title: TITLE,
        userId: USER,
      });

      const document: IntroDocumentV1 = {
        schemaVersion: 1,
        title: TITLE,
        compositionAspect: { w: 9, h: 16 },
        scenes: [
          {
            id: cryptoRandomId(),
            durationMs: 3500,
            background: { type: "COLOR", color: "#312E81" },
            transition: { type: "FADE", durationMs: 400 },
            elements: [
              {
                id: cryptoRandomId(),
                type: "LOGO",
                frame: { x: 0.3, y: 0.12, w: 0.4, h: 0.14 },
                zIndex: 2,
                visible: true,
                opacity: 1,
                motion: { type: "FADE_IN", startMs: 0, durationMs: 500 },
                payload: { mediaId: logoMedia.mediaId, fit: "CONTAIN" },
              },
              {
                id: cryptoRandomId(),
                type: "IMAGE",
                frame: { x: 0.1, y: 0.3, w: 0.8, h: 0.32 },
                zIndex: 1,
                visible: true,
                opacity: 1,
                motion: { type: "SCALE_IN", startMs: 200, durationMs: 600 },
                payload: { mediaId: imageMedia.mediaId, fit: "COVER" },
              },
              {
                id: cryptoRandomId(),
                type: "TEXT",
                frame: { x: 0.08, y: 0.66, w: 0.84, h: 0.1 },
                zIndex: 3,
                visible: true,
                opacity: 1,
                motion: { type: "ENTER_BOTTOM", startMs: 400, durationMs: 500 },
                payload: {
                  text: "DIBAY GRAND OPENING",
                  color: "#FFFFFF",
                  fontSizeNorm: 0.038,
                  align: "center",
                  weight: "bold",
                },
              },
              {
                id: cryptoRandomId(),
                type: "CTA",
                frame: { x: 0.2, y: 0.8, w: 0.6, h: 0.08 },
                zIndex: 4,
                visible: true,
                opacity: 1,
                motion: { type: "FADE_IN", startMs: 800, durationMs: 400 },
                payload: {
                  label: "다음",
                  action: { type: "NEXT_SCENE" },
                  backgroundColor: "#FFFFFF",
                  textColor: "#312E81",
                },
              },
            ],
          },
          {
            id: cryptoRandomId(),
            durationMs: 3000,
            background: { type: "COLOR", color: "#9D174D" },
            transition: { type: "SLIDE", durationMs: 450, direction: "LEFT" },
            elements: [
              {
                id: cryptoRandomId(),
                type: "IMAGE",
                frame: { x: 0.12, y: 0.2, w: 0.76, h: 0.36 },
                zIndex: 1,
                visible: true,
                opacity: 1,
                motion: { type: "ENTER_RIGHT", startMs: 0, durationMs: 550 },
                payload: { mediaId: imageMedia.mediaId, fit: "CONTAIN" },
              },
              {
                id: cryptoRandomId(),
                type: "TEXT",
                frame: { x: 0.08, y: 0.62, w: 0.84, h: 0.1 },
                zIndex: 2,
                visible: true,
                opacity: 1,
                motion: { type: "ENTER_LEFT", startMs: 250, durationMs: 500 },
                payload: {
                  text: "Welcome to DIBAY",
                  color: "#FEF3C7",
                  fontSizeNorm: 0.036,
                  align: "center",
                  weight: "medium",
                },
              },
              {
                id: cryptoRandomId(),
                type: "CTA",
                frame: { x: 0.2, y: 0.78, w: 0.6, h: 0.08 },
                zIndex: 3,
                visible: true,
                opacity: 1,
                motion: { type: "SCALE_IN", startMs: 500, durationMs: 400 },
                payload: {
                  label: "시작하기",
                  action: { type: "FINISH_INTRO" },
                  backgroundColor: "#FEF3C7",
                  textColor: "#9D174D",
                },
              },
            ],
          },
        ],
      };

      const saved = await saveIntroDocument(sb, {
        documentId: created.document_id,
        expectedDraftVersion: created.draft_version,
        document,
        title: TITLE,
        userId: USER,
      });

      const published = await publishIntroDocument(sb, {
        documentId: saved.document_id,
        userId: USER,
        idempotencyKey: `grand-opening-${saved.document_id}-${saved.draft_version}`,
      });

      const live = await setLiveRelease(sb, {
        releaseId: published.releaseId,
        userId: USER,
      });

      const proof = {
        title: TITLE,
        documentId: saved.document_id,
        draftVersion: saved.draft_version,
        releaseId: published.releaseId,
        packageId: published.packageId,
        packageIntegrity: published.packageIntegrity,
        liveReleaseId: live.liveReleaseId ?? published.releaseId,
        scene1Bg: "#312E81",
        scene2Bg: "#9D174D",
        transitionScene1: "FADE",
        transitionScene2: "SLIDE_LEFT",
        media: {
          image: imageMedia.mediaId,
          logo: logoMedia.mediaId,
        },
        via: "admin_document_service_same_as_ui_apis",
        not: "raw_sql_insert",
      };
      writeFileSync(`${OUT}/OWNER_FIXTURE.json`, JSON.stringify(proof, null, 2));
      expect(saved.title).toBe(TITLE);
      expect(published.releaseId).toBeTruthy();
      expect(live.liveReleaseId ?? published.releaseId).toBe(published.releaseId);
    },
    120_000,
  );
});
