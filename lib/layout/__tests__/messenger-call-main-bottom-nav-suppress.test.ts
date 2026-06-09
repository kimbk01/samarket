import { describe, expect, it } from "vitest";
import {
  getMessengerCallMainBottomNavSuppressed,
  pushMessengerCallMainBottomNavSuppressed,
} from "@/lib/layout/messenger-call-main-bottom-nav-suppress";

describe("messenger-call-main-bottom-nav-suppress", () => {
  it("ref-counts overlapping call surfaces", () => {
    const releaseA = pushMessengerCallMainBottomNavSuppressed();
    expect(getMessengerCallMainBottomNavSuppressed()).toBe(true);
    const releaseB = pushMessengerCallMainBottomNavSuppressed();
    expect(getMessengerCallMainBottomNavSuppressed()).toBe(true);
    releaseA();
    expect(getMessengerCallMainBottomNavSuppressed()).toBe(true);
    releaseB();
    expect(getMessengerCallMainBottomNavSuppressed()).toBe(false);
  });
});
