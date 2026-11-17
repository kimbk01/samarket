/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LAST_RUN_SNAPSHOT_KEY,
  LAST_RUN_SNAPSHOT_VERSION,
  clearLastRunSnapshot,
  parseLastRunSnapshot,
  readLastRunSnapshotForCurrentAccount,
  updateLastRunSnapshot,
} from "@/lib/startup/last-run-snapshot";

const COOKIE = "sb-proj-auth-token";

function signIn(userId: string): void {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify({ user: { id: userId } }))}; path=/`;
}

function signOut(): void {
  document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

describe("last-run-snapshot (F3-a)", () => {
  beforeEach(() => {
    localStorage.clear();
    signOut();
  });
  afterEach(() => {
    signOut();
  });

  it("writes on success and reads back for the same cookie account", () => {
    signIn("user-a");
    updateLastRunSnapshot({ member: true }, "user-a");
    updateLastRunSnapshot({ addressLine: " Pasig City " }, "user-a");
    updateLastRunSnapshot({ avatarUrl: "https://cdn.example/a.jpg", bellUnread: 25, telringUnread: 37 }, "user-a");
    const snap = readLastRunSnapshotForCurrentAccount();
    expect(snap).toMatchObject({
      v: LAST_RUN_SNAPSHOT_VERSION,
      account: "user-a",
      member: true,
      addressLine: "Pasig City",
      avatarUrl: "https://cdn.example/a.jpg",
      bellUnread: 25,
      telringUnread: 37,
    });
    expect(Object.keys(localStorage).filter((k) => k.startsWith("dibay:startup:last-run"))).toEqual([LAST_RUN_SNAPSHOT_KEY]);
  });

  it("returns null with no auth cookie (guest) and never writes for a guest", () => {
    updateLastRunSnapshot({ member: true, bellUnread: 3 });
    expect(localStorage.getItem(LAST_RUN_SNAPSHOT_KEY)).toBeNull();
    signIn("user-a");
    updateLastRunSnapshot({ bellUnread: 3 }, "user-a");
    signOut();
    expect(readLastRunSnapshotForCurrentAccount()).toBeNull();
  });

  it("ignores another account's snapshot (account mismatch)", () => {
    signIn("user-a");
    updateLastRunSnapshot({ member: true, addressLine: "Pasig City", bellUnread: 9 }, "user-a");
    signIn("user-b");
    expect(readLastRunSnapshotForCurrentAccount()).toBeNull();
  });

  it("does not write when the confirmed user differs from the cookie account", () => {
    signIn("user-a");
    updateLastRunSnapshot({ bellUnread: 4 }, "user-b");
    expect(localStorage.getItem(LAST_RUN_SNAPSHOT_KEY)).toBeNull();
  });

  it("a new account's write replaces the old account's values instead of merging", () => {
    signIn("user-a");
    updateLastRunSnapshot({ member: true, addressLine: "Pasig City", avatarUrl: "https://cdn.example/a.jpg" }, "user-a");
    signIn("user-b");
    updateLastRunSnapshot({ bellUnread: 2 }, "user-b");
    const snap = readLastRunSnapshotForCurrentAccount();
    expect(snap?.account).toBe("user-b");
    expect(snap?.bellUnread).toBe(2);
    expect(snap?.addressLine).toBeUndefined();
    expect(snap?.avatarUrl).toBeUndefined();
  });

  it("logout clear removes the snapshot", () => {
    signIn("user-a");
    updateLastRunSnapshot({ member: true }, "user-a");
    clearLastRunSnapshot();
    expect(localStorage.getItem(LAST_RUN_SNAPSHOT_KEY)).toBeNull();
    expect(readLastRunSnapshotForCurrentAccount()).toBeNull();
  });

  it("client-session-wipe calls clearLastRunSnapshot before the localStorage sweep", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/auth/client-session-wipe.ts"), "utf8");
    const at = src.indexOf("clearLastRunSnapshot();");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf("clearEphemeralLocalStorage();\n  clearBoundAuthUserId();"));
  });

  it("rejects other versions and malformed JSON", () => {
    signIn("user-a");
    localStorage.setItem(LAST_RUN_SNAPSHOT_KEY, JSON.stringify({ v: 0, account: "user-a", member: true }));
    expect(readLastRunSnapshotForCurrentAccount()).toBeNull();
    localStorage.setItem(LAST_RUN_SNAPSHOT_KEY, "{not json");
    expect(readLastRunSnapshotForCurrentAccount()).toBeNull();
    expect(parseLastRunSnapshot(JSON.stringify({ v: LAST_RUN_SNAPSHOT_VERSION, account: "guest" }))).toBeNull();
  });

  it("normalizes counts and keeps explicit null address/avatar", () => {
    signIn("user-a");
    updateLastRunSnapshot({ bellUnread: 3.7, telringUnread: -5, addressLine: "  ", avatarUrl: null }, "user-a");
    const snap = readLastRunSnapshotForCurrentAccount();
    expect(snap?.bellUnread).toBe(3);
    expect(snap?.telringUnread).toBe(0);
    expect(snap?.addressLine).toBeNull();
    expect(snap?.avatarUrl).toBeNull();
  });

  it("skips the write when values are unchanged", () => {
    signIn("user-a");
    updateLastRunSnapshot({ bellUnread: 5 }, "user-a");
    const first = localStorage.getItem(LAST_RUN_SNAPSHOT_KEY);
    updateLastRunSnapshot({ bellUnread: 5 }, "user-a");
    expect(localStorage.getItem(LAST_RUN_SNAPSHOT_KEY)).toBe(first);
  });

  it("설계 D3: MY 작은 사본(data URL) — 저장·읽기 · 모양/크기 틀리면 버림 · null 은 지움", () => {
    signIn("user-a");
    const data = "data:image/jpeg;base64," + "A".repeat(200);
    updateLastRunSnapshot({ avatarThumb: { src: "https://cdn.example/a.jpg", data } }, "user-a");
    expect(readLastRunSnapshotForCurrentAccount()?.avatarThumb).toEqual({ src: "https://cdn.example/a.jpg", data });
    updateLastRunSnapshot({ avatarThumb: { src: "https://cdn.example/a.jpg", data: "data:image/jpeg;base64," + "A".repeat(20000) } }, "user-a");
    expect(readLastRunSnapshotForCurrentAccount()?.avatarThumb).toBeNull();
    updateLastRunSnapshot({ avatarThumb: { src: "https://cdn.example/a.jpg", data } }, "user-a");
    updateLastRunSnapshot({ avatarThumb: null }, "user-a");
    expect(readLastRunSnapshotForCurrentAccount()?.avatarThumb).toBeNull();
    expect(parseLastRunSnapshot(JSON.stringify({ v: LAST_RUN_SNAPSHOT_VERSION, account: "user-a", writtenAt: 1, avatarThumb: { src: "x", data: "javascript:1" } }))?.avatarThumb).toBeNull();
  });
});
