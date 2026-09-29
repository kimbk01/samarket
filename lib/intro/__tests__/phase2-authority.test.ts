/**
 * DIBAY INTRO — Phase 2 contract/schema alignment tests (static).
 * Does not claim live DB PASS.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GifRuntimeFormat } from "../contracts/gif";
import { MediaStatus, ServerLiveStatus } from "../contracts/status";
import {
  APP_INTRO_MUTATION_AUTHORITY,
  APP_INTRO_STORAGE_AUTHORITY_PREFIX,
  APP_INTRO_STORAGE_BUCKET,
  APP_INTRO_TABLES,
  AppIntroLiveKind,
  AppIntroMediaLifecycleState,
  AppIntroPublishOpStatus,
  AppIntroStorageSubspace,
  FORBIDDEN_MEDIA_STATE,
  mapsToDeviceNoLiveIntro,
} from "../db/authority";
import {
  GIF_DB_RUNTIME_FORMAT,
  INTENTIONAL_CONTRACT_DB_DIFFERENCES,
  MEDIA_STATUS_TO_LIFECYCLE,
  deviceLiveKindFromPhysical,
} from "../db/alignment";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20270401120000_app_intro_canonical_db_storage_security.sql",
);

describe("Phase 2 — DB/Storage/Security authority (static)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("names all canonical tables and forbids historical product namespaces as CREATE targets", () => {
    for (const t of APP_INTRO_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
    expect(sql).not.toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.(dibay_intro_|intro_v3_|opening_|intro12_)/i,
    );
  });

  it("locks media lifecycle states and forbids PARTIALLY_READY", () => {
    for (const s of Object.values(AppIntroMediaLifecycleState)) {
      expect(sql).toContain(`'${s}'`);
    }
    expect(sql).toContain(FORBIDDEN_MEDIA_STATE);
    expect(sql).toMatch(/status\s*<>\s*'PARTIALLY_READY'/);
  });

  it("locks publish op states and idempotency uniqueness", () => {
    for (const s of Object.values(AppIntroPublishOpStatus)) {
      expect(sql).toContain(`'${s}'`);
    }
    expect(sql).toContain(
      "UNIQUE (document_id, source_draft_version, idempotency_key)",
    );
  });

  it("seeds inert NEVER_CONFIGURED live and distinguishes NO_LIVE_INTRO", () => {
    expect(sql).toContain("'NEVER_CONFIGURED'");
    expect(sql).toContain("'NO_LIVE_INTRO'");
    expect(sql).toContain("'COMMITTED_LIVE'");
    expect(sql).toContain("ON CONFLICT (singleton) DO NOTHING");
    expect(mapsToDeviceNoLiveIntro(AppIntroLiveKind.NEVER_CONFIGURED)).toBe(
      true,
    );
    expect(mapsToDeviceNoLiveIntro(AppIntroLiveKind.NO_LIVE_INTRO)).toBe(true);
    expect(mapsToDeviceNoLiveIntro(AppIntroLiveKind.COMMITTED_LIVE)).toBe(
      false,
    );
    expect(deviceLiveKindFromPhysical(AppIntroLiveKind.NEVER_CONFIGURED)).toBe(
      ServerLiveStatus.NO_LIVE_INTRO,
    );
  });

  it("enables FORCE RLS + service_role grants without client policies", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("TO service_role");
    // Strip SQL line comments before scanning for policy DDL.
    const ddl = sql
      .split(/\n/)
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(ddl).not.toMatch(/CREATE\s+POLICY/i);
    expect(APP_INTRO_MUTATION_AUTHORITY.directClientTablePolicies).toBe(false);
    expect(APP_INTRO_MUTATION_AUTHORITY.browserServiceRole).toBe(false);
  });

  it("reuses private dibay-intro and authority/v1 subspaces", () => {
    expect(APP_INTRO_STORAGE_BUCKET).toBe("dibay-intro");
    expect(sql).toContain("dibay-intro");
    expect(sql).toContain("public = false");
    expect(sql).toContain(APP_INTRO_STORAGE_AUTHORITY_PREFIX);
    for (const prefix of Object.values(AppIntroStorageSubspace)) {
      expect(sql).toContain(prefix);
    }
  });

  it("preserves GIF CANONICAL_ANIMATED_GIF format capability without processor", () => {
    expect(GIF_DB_RUNTIME_FORMAT).toBe(GifRuntimeFormat.CANONICAL_ANIMATED_GIF);
    expect(sql).toContain("CANONICAL_ANIMATED_GIF");
    expect(sql.toLowerCase()).toContain("no processor");
  });

  it("maps Phase 1 MediaStatus into lifecycle without rewriting Phase 1 contracts", () => {
    expect(MEDIA_STATUS_TO_LIFECYCLE[MediaStatus.READY]).toBe(
      AppIntroMediaLifecycleState.READY,
    );
    expect(INTENTIONAL_CONTRACT_DB_DIFFERENCES.length).toBeGreaterThan(0);
  });

  it("uses RESTRICT/SET NULL so published history survives library delete", () => {
    expect(sql).toMatch(
      /app_intro_sealed_assets[\s\S]*media_id uuid\s+REFERENCES public\.app_intro_media \(media_id\) ON DELETE SET NULL/,
    );
    expect(sql).toMatch(
      /app_intro_sealed_assets[\s\S]*runtime_artifact_id uuid\s+REFERENCES public\.app_intro_runtime_artifacts \(runtime_artifact_id\) ON DELETE SET NULL/,
    );
    expect(sql).toMatch(
      /REFERENCES public\.app_intro_documents \(document_id\) ON DELETE RESTRICT/,
    );
    expect(sql).not.toMatch(
      /app_intro_sealed_assets[\s\S]*ON DELETE CASCADE/,
    );
  });
});
