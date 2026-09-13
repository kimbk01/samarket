import { describe, expect, it, vi } from "vitest";
import {
  ExternalBoardSourceDuplicateError,
  SOURCE_BOARD_ALREADY_REGISTERED,
  createExternalBoardSource,
  patchExternalBoardSource,
} from "@/lib/external-board-import/registry/source-board-store";
import { deriveSourceBoardIdentity } from "@/lib/external-board-import/identity/source-board-identity";

function existingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "src-existing",
    site_name: "fixture.external-board.local",
    source_board_name: "ORIGINAL NAME",
    source_url: "https://fixture.external-board.local/qa-dup",
    site_key: "fixture.external-board.local",
    board_key: "/qa-dup",
    target_topic_id: null,
    target_topic_slug: "travel",
    target_location_id: null,
    target_region_label: null,
    mode: "MANUAL",
    check_status: null,
    check_reasons: [],
    rights_basis: "ORIGINAL RIGHTS",
    rights_status: "declared",
    attribution_required: false,
    attribution_display_name: null,
    board_sequence_verified: false,
    author_pool_id: null,
    date_recent_min_days: 3,
    date_recent_max_days: 10,
    view_seed_min: 100,
    view_seed_max: 500,
    last_checked_at: null,
    last_fetched_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type MockOpts = {
  insertResult?: { data?: Record<string, unknown> | null; error?: { code?: string; message?: string } | null };
  identityLookup?: { data?: Record<string, unknown> | null; error?: { message?: string } | null };
  updateResult?: { data?: Record<string, unknown> | null; error?: { message?: string } | null };
};

function mockSb(opts: MockOpts = {}) {
  const insert = vi.fn<(payload: Record<string, unknown>) => Promise<MockOpts["insertResult"]>>(
    async (_payload) => opts.insertResult ?? { data: existingRow({ id: "src-new" }), error: null }
  );
  const identityLookup = vi.fn<(siteKey: string, boardKey: string) => Promise<MockOpts["identityLookup"]>>(
    async (_siteKey, _boardKey) => opts.identityLookup ?? { data: existingRow(), error: null }
  );
  const update = vi.fn<(payload: Record<string, unknown>) => Promise<MockOpts["updateResult"]>>(
    async (_payload) =>
      opts.updateResult ?? {
        data: existingRow({ source_board_name: "EDITED NAME", updated_at: "2026-01-02T00:00:00.000Z" }),
        error: null,
      }
  );

  const sb = {
    from: (table: string) => {
      expect(table).toBe("external_board_sources");
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => insert(payload),
          }),
        }),
        select: () => ({
          eq: (col1: string, v1: string) => ({
            eq: (col2: string, v2: string) => ({
              maybeSingle: async () => {
                expect(col1).toBe("site_key");
                expect(col2).toBe("board_key");
                return identityLookup(v1, v2);
              },
            }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, _id: string) => ({
            select: () => ({
              single: async () => update(payload),
            }),
          }),
        }),
      };
    },
  };

  return { sb: sb as never, insert, identityLookup, update };
}

describe("external-board source create-only duplicate contract", () => {
  it("creates a new source via INSERT (not upsert)", async () => {
    const { sb, insert } = mockSb({
      insertResult: { data: existingRow({ id: "src-new", source_board_name: "Fresh" }), error: null },
    });
    const created = await createExternalBoardSource(sb, {
      sourceUrl: "https://fixture.external-board.local/qa-dup",
      sourceBoardName: "Fresh",
      rightsBasis: "TEST",
      mode: "MANUAL",
    });
    expect(created.id).toBe("src-new");
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0]?.[0];
    expect(payload?.source_board_name).toBe("Fresh");
    expect(payload?.site_key).toBe("fixture.external-board.local");
    expect(payload?.board_key).toBe("/qa-dup");
  });

  it("duplicate identity returns structured duplicate without update path", async () => {
    const original = existingRow();
    const { sb, insert, identityLookup, update } = mockSb({
      insertResult: {
        data: null,
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "external_board_sources_identity_uidx"',
        },
      },
      identityLookup: { data: original, error: null },
    });

    await expect(
      createExternalBoardSource(sb, {
        sourceUrl: "https://fixture.external-board.local/qa-dup",
        sourceBoardName: "SHOULD NOT APPLY",
        rightsBasis: "MUTATE RIGHTS",
        mode: "AUTO",
        targetTopicSlug: "mutated",
      })
    ).rejects.toBeInstanceOf(ExternalBoardSourceDuplicateError);

    try {
      await createExternalBoardSource(sb, {
        sourceUrl: "https://fixture.external-board.local/qa-dup",
        sourceBoardName: "SHOULD NOT APPLY",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalBoardSourceDuplicateError);
      const dup = e as ExternalBoardSourceDuplicateError;
      expect(dup.code).toBe(SOURCE_BOARD_ALREADY_REGISTERED);
      expect(dup.existingSource.id).toBe("src-existing");
      expect(dup.existingSource.source_board_name).toBe("ORIGINAL NAME");
      expect(dup.existingSource.rights_basis).toBe("ORIGINAL RIGHTS");
      expect(dup.existingSource.mode).toBe("MANUAL");
      expect(dup.existingSource.target_topic_slug).toBe("travel");
    }

    expect(insert).toHaveBeenCalled();
    expect(identityLookup).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("maps equivalent URLs to the same board identity", () => {
    const a = deriveSourceBoardIdentity("https://WWW.Example.com/board/foo/?x=1#hash");
    const b = deriveSourceBoardIdentity("https://example.com/board/foo?x=1");
    expect(a?.siteKey).toBe(b?.siteKey);
    expect(a?.boardKey).toBe(b?.boardKey);
    expect(a?.siteKey).toBe("example.com");
  });

  it("explicit patch still updates allowed fields", async () => {
    const { sb, update, insert } = mockSb();
    const patched = await patchExternalBoardSource(sb, "src-existing", {
      sourceBoardName: "EDITED NAME",
    });
    expect(patched.source_board_name).toBe("EDITED NAME");
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });
});
