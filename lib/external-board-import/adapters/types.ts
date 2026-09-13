import { createHash } from "node:crypto";
import type {
  ExternalBoardDiscoverItem,
  ExternalBoardDocument,
} from "@/lib/external-board-import/types";

export type ExternalBoardAdapterContext = {
  sourceUrl: string;
  siteKey: string;
  boardKey: string;
};

export type ExternalBoardAdapterVerifyResult = {
  status: "READY" | "PARTIAL" | "UNSUPPORTED";
  reasons: string[];
  samples: ExternalBoardDiscoverItem[];
};

export type ExternalBoardAdapter = {
  id: string;
  /** Return true if this adapter can attempt the host/path. */
  matches: (ctx: ExternalBoardAdapterContext) => boolean;
  verifyBoard: (ctx: ExternalBoardAdapterContext) => Promise<ExternalBoardAdapterVerifyResult>;
  discoverArticles: (
    ctx: ExternalBoardAdapterContext,
    opts?: { limit?: number }
  ) => Promise<ExternalBoardDiscoverItem[]>;
  fetchArticleDocument: (
    ctx: ExternalBoardAdapterContext,
    item: ExternalBoardDiscoverItem
  ) => Promise<ExternalBoardDocument>;
};

/** Deterministic fixture host — unit/integration only. Never Production acceptance. */
export const FIXTURE_ADAPTER_HOST = "fixture.external-board.local";

function fixtureDoc(id: string, title: string): ExternalBoardDocument {
  return {
    title,
    canonicalUrl: `https://${FIXTURE_ADAPTER_HOST}/a/${id}`,
    nodes: [
      { type: "paragraph", text: `Fixture paragraph for ${id}.` },
      {
        type: "image",
        src: `https://${FIXTURE_ADAPTER_HOST}/img/${id}.jpg`,
        alt: `img-${id}`,
      },
      { type: "paragraph", text: "Second paragraph after image." },
      { type: "list", ordered: false, items: ["one", "two"] },
      { type: "quote", text: "Quoted line" },
      { type: "link", href: `https://${FIXTURE_ADAPTER_HOST}/ref/${id}`, text: "ref" },
    ],
  };
}

export const fixtureExternalBoardAdapter: ExternalBoardAdapter = {
  id: "fixture",
  matches: (ctx) => ctx.siteKey === FIXTURE_ADAPTER_HOST || ctx.sourceUrl.includes(FIXTURE_ADAPTER_HOST),
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 3) {
      return { status: "READY", reasons: ["fixture_adapter_ready"], samples: withDocs };
    }
    if (withDocs.length > 0) {
      return { status: "PARTIAL", reasons: ["fixture_partial_samples"], samples: withDocs };
    }
    return { status: "UNSUPPORTED", reasons: ["fixture_no_samples"], samples: [] };
  },
  async discoverArticles(_ctx, opts) {
    const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 10);
    const items: ExternalBoardDiscoverItem[] = [];
    for (let i = 1; i <= limit; i += 1) {
      const id = `fx-${i}`;
      const doc = fixtureDoc(id, `Fixture article ${i}`);
      items.push({
        stableArticleIdentity: `stable:${id}`,
        identityKind: "stable_id",
        canonicalUrl: doc.canonicalUrl,
        title: doc.title,
        sampleDocument: doc,
      });
    }
    return items;
  },
  async fetchArticleDocument(_ctx, item) {
    if (item.sampleDocument) return item.sampleDocument;
    const id = item.stableArticleIdentity.replace(/^stable:/, "") || "unknown";
    return fixtureDoc(id, item.title || `Fixture ${id}`);
  },
};

export function mediaIdentityFromUrl(src: string): string {
  const normalized = String(src ?? "").trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
