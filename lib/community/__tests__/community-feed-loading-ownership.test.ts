import { describe, expect, it } from "vitest";
import {
  communityFeedShouldHoldPendingBeforeDeferredFetch,
  communityFeedShouldShowEmptyCta,
  communityInitialLoadFinallyClearsLoading,
} from "@/lib/community/community-feed-loading-ownership";

describe("community-feed-loading-ownership (D3)", () => {
  it("abort/deferred gap: invalidate token → finally must not clear loading", () => {
    const requestToken = 3;
    const currentAfterCleanup = 4; // cleanup bumped before abort
    expect(
      communityInitialLoadFinallyClearsLoading({
        append: false,
        requestToken,
        currentToken: currentAfterCleanup,
      })
    ).toBe(false);
  });

  it("settled same-token request may clear loading", () => {
    expect(
      communityInitialLoadFinallyClearsLoading({
        append: false,
        requestToken: 5,
        currentToken: 5,
      })
    ).toBe(true);
  });

  it("cold miss holds PENDING before deferred fetch → empty CTA false", () => {
    expect(
      communityFeedShouldHoldPendingBeforeDeferredFetch({ hasRenderableRows: false })
    ).toBe(true);
    expect(
      communityFeedShouldShowEmptyCta({
        hasError: false,
        loading: true,
        postCount: 0,
      })
    ).toBe(false);
  });

  it("authoritative zero after settle → empty CTA true", () => {
    expect(
      communityFeedShouldShowEmptyCta({
        hasError: false,
        loading: false,
        postCount: 0,
      })
    ).toBe(true);
  });

  it("cache hit path does not force pending hold", () => {
    expect(
      communityFeedShouldHoldPendingBeforeDeferredFetch({ hasRenderableRows: true })
    ).toBe(false);
  });
});
