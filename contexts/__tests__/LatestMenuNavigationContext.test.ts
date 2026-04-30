import { describe, expect, it } from "vitest";
import {
  isMenuIntentResolvedByLocation,
  menuHrefMatchesIntent,
  parseMenuNavigationHref,
  type MenuNavigationIntent,
} from "../LatestMenuNavigationContext";

function makeIntent(href: string): MenuNavigationIntent {
  const parsed = parseMenuNavigationHref(href);
  return {
    id: 1,
    href: parsed.href,
    pathname: parsed.pathname,
    search: parsed.search,
    source: "bottom-nav",
    startedAt: 0,
  };
}

describe("LatestMenuNavigationContext helpers", () => {
  it("normalizes query order before comparing hrefs", () => {
    const intent = makeIntent("/market?tradeState=active&jk=work");
    expect(menuHrefMatchesIntent("/market?jk=work&tradeState=active", intent)).toBe(true);
  });

  it("requires exact pathname and search for non-messenger menu intents", () => {
    const intent = makeIntent("/philife?category=jobs&sort=latest");
    expect(isMenuIntentResolvedByLocation(intent, "/philife", "sort=latest&category=jobs")).toBe(true);
    expect(isMenuIntentResolvedByLocation(intent, "/philife", "category=jobs")).toBe(false);
    expect(isMenuIntentResolvedByLocation(intent, "/philife/post-1", "category=jobs&sort=latest")).toBe(false);
  });

  it("treats any community messenger surface as resolved for the menu root intent", () => {
    const intent = makeIntent("/community-messenger?section=chats");
    expect(isMenuIntentResolvedByLocation(intent, "/community-messenger", "")).toBe(true);
    expect(isMenuIntentResolvedByLocation(intent, "/community-messenger/rooms/room-1", "")).toBe(true);
  });
});
