import { expect, test, type Page } from "@playwright/test";
import { ensureE2eUserSession, playwrightOriginFromEnv } from "./helpers/playwright-origin-and-session";
import { setAppLanguageOnPage } from "./helpers/i18n-set-app-language";

const REJECT_BTN = /^(거절|Reject)$/i;
const ACCEPT_BTN = /^(응답|수락|Accept)$/i;
const END_BTN = /^(종료|End)$/i;

const SESSION_ID = "e2e-call-terminal-flows-session";
const ROOM_ID = "e2e-call-terminal-room";
const PEER_USER_ID = "e2e-peer-user-id";

type MockSession = {
  id: string;
  roomId: string;
  sessionMode: "direct";
  callKind: "voice" | "video";
  status: "ringing" | "active" | "rejected" | "cancelled" | "ended";
  initiatorUserId: string;
  recipientUserId: string;
  peerUserId: string;
  peerLabel: string;
  peerAvatarUrl: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  isMineInitiator: boolean;
  participants: [];
};

function baseSession(overrides: Partial<MockSession> & Pick<MockSession, "callKind" | "status" | "isMineInitiator">): MockSession {
  const isInitiator = overrides.isMineInitiator;
  return {
    id: SESSION_ID,
    roomId: ROOM_ID,
    sessionMode: "direct",
    initiatorUserId: isInitiator ? "e2e-self" : PEER_USER_ID,
    recipientUserId: isInitiator ? PEER_USER_ID : "e2e-self",
    peerUserId: PEER_USER_ID,
    peerLabel: "E2E 상대",
    peerAvatarUrl: null,
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    participants: [],
    ...overrides,
  };
}

async function installMediaMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fakeTrack = {
      kind: "audio",
      enabled: true,
      stop: () => {},
      getSettings: () => ({}),
    };
    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack],
      getVideoTracks: () => [],
      addTrack: () => {},
      removeTrack: () => {},
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
        enumerateDevices: async () => [],
      },
    });
  });
}

async function installCallApiMocks(
  page: Page,
  opts: {
    initial: MockSession;
    patchDelayMs?: number;
    terminalStatus?: MockSession["status"];
  }
): Promise<{ patchBodies: Array<{ action?: string }> }> {
  const state = { session: opts.initial };
  const patchBodies: Array<{ action?: string }> = [];

  await page.route(`**/api/community-messenger/calls/sessions/${SESSION_ID}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, session: state.session }),
      });
      return;
    }
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { action?: string };
      patchBodies.push(body);
      if (opts.patchDelayMs) await new Promise((r) => setTimeout(r, opts.patchDelayMs));
      const terminal = opts.terminalStatus ?? (body.action === "reject" ? "rejected" : body.action === "cancel" ? "cancelled" : "ended");
      state.session = {
        ...state.session,
        status: terminal,
        endedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, session: state.session }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route(`**/api/community-messenger/calls/sessions/${SESSION_ID}/signals`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route(`**/api/community-messenger/calls/sessions/${SESSION_ID}/token`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        token: "e2e-token",
        channel: "e2e-channel",
        uid: 1,
        appId: "e2e-app",
      }),
    });
  });

  return { patchBodies };
}

async function openCallScreen(
  page: Page,
  origin: string,
  readyText?: string | RegExp
): Promise<void> {
  await page.goto(`${origin}/community-messenger/calls/${SESSION_ID}`, { waitUntil: "domcontentloaded" });
  if (readyText) {
    await expect(page.getByText(readyText)).toBeVisible({ timeout: 20_000 });
  }
  await expect(page.getByRole("button").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("community messenger call terminal flows (CM-INSTANT)", () => {
  test.beforeEach(async ({ page }) => {
    await setAppLanguageOnPage(page, "ko");
    try {
      await ensureE2eUserSession(page, {
        username: process.env.E2E_TEST_USERNAME ?? "aaaa",
        password: process.env.E2E_TEST_PASSWORD ?? "1234",
      });
    } catch {
      test.skip(true, "E2E login unavailable");
    }
    await installMediaMocks(page);
    await page.evaluate(() => {
      try {
        sessionStorage.removeItem("samarket:cm-active-call-recovery");
        sessionStorage.removeItem("samarket:cm-terminal-call-recovery-suppress");
      } catch {
        /* ignore */
      }
    });
  });

  test("incoming voice reject — optimistic terminal before slow PATCH", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    const { patchBodies } = await installCallApiMocks(page, {
      initial: baseSession({ callKind: "voice", status: "ringing", isMineInitiator: false }),
      patchDelayMs: 800,
      terminalStatus: "rejected",
    });

    await openCallScreen(page, origin);
    await expect(page.getByRole("button", { name: REJECT_BTN })).toBeVisible();

    const rejectBtn = page.getByRole("button", { name: REJECT_BTN });
    await rejectBtn.click();

    /** dismiss in-flight 동안 링 UI 유지 — 즉시 비활성·PATCH 선행이 체감 목표 */
    await expect(rejectBtn).toBeDisabled({ timeout: 300 });
    await expect.poll(() => patchBodies.some((b) => b.action === "reject"), { timeout: 5_000 }).toBe(true);
  });

  test("incoming video reject — optimistic terminal before slow PATCH", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    const { patchBodies } = await installCallApiMocks(page, {
      initial: baseSession({ callKind: "video", status: "ringing", isMineInitiator: false }),
      patchDelayMs: 800,
      terminalStatus: "rejected",
    });

    await openCallScreen(page, origin);
    await expect(page.getByRole("button", { name: REJECT_BTN })).toBeVisible();
    const rejectBtn = page.getByRole("button", { name: REJECT_BTN });
    await rejectBtn.click();

    await expect(rejectBtn).toBeDisabled({ timeout: 300 });
    await expect.poll(() => patchBodies.some((b) => b.action === "reject"), { timeout: 5_000 }).toBe(true);
  });

  test("outgoing voice cancel — optimistic terminal before slow PATCH", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    const { patchBodies } = await installCallApiMocks(page, {
      initial: baseSession({ callKind: "voice", status: "ringing", isMineInitiator: true }),
      patchDelayMs: 800,
      terminalStatus: "cancelled",
    });

    await openCallScreen(page, origin, "전화 거는 중");
    await page.getByRole("button", { name: END_BTN }).click();

    /** optimistic 종료 후 종료 버튼이 사라질 수 있음 — PATCH cancel 이 핵심 */
    await expect.poll(() => patchBodies.some((b) => b.action === "cancel"), { timeout: 5_000 }).toBe(true);
  });

  test("active voice end — PATCH end action", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    const { patchBodies } = await installCallApiMocks(page, {
      initial: baseSession({ callKind: "voice", status: "active", isMineInitiator: true }),
      patchDelayMs: 400,
      terminalStatus: "ended",
    });

    await openCallScreen(page, origin);
    await page.getByRole("button", { name: END_BTN }).click();

    await expect.poll(() => patchBodies.some((b) => b.action === "end"), { timeout: 5_000 }).toBe(true);
  });

  test("incoming voice accept — PATCH accept then connecting UI", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    const { patchBodies } = await installCallApiMocks(page, {
      initial: baseSession({ callKind: "voice", status: "ringing", isMineInitiator: false }),
      patchDelayMs: 100,
      terminalStatus: "active",
    });

    await openCallScreen(page, origin);
    await page.getByRole("button", { name: ACCEPT_BTN }).click();

    await expect.poll(() => patchBodies.some((b) => b.action === "accept"), { timeout: 5_000 }).toBe(true);
    await expect(page.getByRole("button", { name: ACCEPT_BTN })).toBeHidden({ timeout: 10_000 });
  });
});
