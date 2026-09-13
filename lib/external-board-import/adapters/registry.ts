import {
  FIXTURE_ADAPTER_HOST,
  fixtureExternalBoardAdapter,
  type ExternalBoardAdapter,
  type ExternalBoardAdapterContext,
} from "@/lib/external-board-import/adapters/types";
import { deriveSourceBoardIdentity } from "@/lib/external-board-import/identity/source-board-identity";

const ADAPTERS: ExternalBoardAdapter[] = [fixtureExternalBoardAdapter];

export function listExternalBoardAdapters(): readonly ExternalBoardAdapter[] {
  return ADAPTERS;
}

export function resolveExternalBoardAdapter(sourceUrl: string): {
  ctx: ExternalBoardAdapterContext;
  adapter: ExternalBoardAdapter | null;
} {
  const identity = deriveSourceBoardIdentity(sourceUrl);
  if (!identity) {
    return {
      ctx: { sourceUrl, siteKey: "", boardKey: "" },
      adapter: null,
    };
  }
  const ctx: ExternalBoardAdapterContext = {
    sourceUrl: identity.canonicalUrl,
    siteKey: identity.siteKey,
    boardKey: identity.boardKey,
  };
  const adapter = ADAPTERS.find((a) => a.matches(ctx)) ?? null;
  return { ctx, adapter };
}

export function isFixtureExternalBoardUrl(url: string): boolean {
  return String(url ?? "").includes(FIXTURE_ADAPTER_HOST);
}

export { FIXTURE_ADAPTER_HOST, fixtureExternalBoardAdapter };
