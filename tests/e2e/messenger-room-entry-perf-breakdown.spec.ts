import { expect, test } from "@playwright/test";

type Snap = {
  appWidePhaseLastMs?: Record<string, number>;
};

function pickNum(s: Snap | null, key: string): number | null {
  const v = s?.appWidePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

async function testLoginViaFetch(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  let ok = false;
  for (let i = 0; i < 3 && !ok; i += 1) {
    if (i > 0) await page.waitForTimeout(600);
    ok = await page.evaluate(
      async ({ origin, user, pass }) => {
        try {
          const res = await fetch(`${origin}/api/test-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username: user, password: pass }),
          });
          const data = (await res.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
          if (!data?.ok || !data.userId || !data.username) return false;
          sessionStorage.setItem("test_user_id", data.userId);
          sessionStorage.setItem("test_username", data.username);
          sessionStorage.setItem("test_role", data.role || "member");
          document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
          window.dispatchEvent(new Event("kasama-test-auth-changed"));
          return true;
        } catch {
          return false;
        }
      },
      { origin: baseURL, user: username, pass: password }
    );
  }
  expect(ok).toBe(true);
}

test.describe("messenger room entry perf breakdown", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("capture messenger room entry breakdown", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() ?? "";
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");

    const origin = baseURL ?? "http://127.0.0.1:3000";
    await testLoginViaFetch(page, origin, user, pass);

    await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
    const roomRow = page.locator('[data-messenger-chat-row="true"]').first();
    await roomRow.waitFor({ state: "visible", timeout: 60_000 });
    await roomRow.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
    await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const snap = await readSnap(page);
          return pickNum(snap, "messenger_room_entry_first_message_render_ms");
        },
        { timeout: 15_000 }
      )
      .not.toBeNull();

    await expect
      .poll(
        async () => {
          const snap = await readSnap(page);
          return pickNum(snap, "messenger_room_entry_composer_textarea_visible_ms");
        },
        { timeout: 15_000 }
      )
      .not.toBeNull();

    const snap = await readSnap(page);
    const result = {
      messenger_room_entry_room_route_enter_ms: pickNum(snap, "messenger_room_entry_room_route_enter_ms"),
      messenger_room_entry_router_push_called_ms: pickNum(snap, "messenger_room_entry_router_push_called_ms"),
      messenger_room_entry_next_route_start_ms: pickNum(snap, "messenger_room_entry_next_route_start_ms"),
      messenger_room_entry_route_module_request_start_ms: pickNum(
        snap,
        "messenger_room_entry_route_module_request_start_ms"
      ),
      messenger_room_entry_route_module_request_end_ms: pickNum(
        snap,
        "messenger_room_entry_route_module_request_end_ms"
      ),
      messenger_room_entry_client_chunk_request_start_ms: pickNum(
        snap,
        "messenger_room_entry_client_chunk_request_start_ms"
      ),
      messenger_room_entry_client_chunk_request_end_ms: pickNum(
        snap,
        "messenger_room_entry_client_chunk_request_end_ms"
      ),
      messenger_room_entry_page_module_eval_start_ms: pickNum(snap, "messenger_room_entry_page_module_eval_start_ms"),
      messenger_room_entry_page_module_eval_end_ms: pickNum(snap, "messenger_room_entry_page_module_eval_end_ms"),
      messenger_room_entry_client_component_module_eval_start_ms: pickNum(
        snap,
        "messenger_room_entry_client_component_module_eval_start_ms"
      ),
      messenger_room_entry_client_component_module_eval_end_ms: pickNum(
        snap,
        "messenger_room_entry_client_component_module_eval_end_ms"
      ),
      messenger_room_entry_CommunityMessengerRoomClient_first_import_ready_ms: pickNum(
        snap,
        "messenger_room_entry_CommunityMessengerRoomClient_first_import_ready_ms"
      ),
      messenger_room_entry_layout_mount_start_ms: pickNum(snap, "messenger_room_entry_layout_mount_start_ms"),
      messenger_room_entry_layout_mount_end_ms: pickNum(snap, "messenger_room_entry_layout_mount_end_ms"),
      messenger_room_entry_page_mount_start_ms: pickNum(snap, "messenger_room_entry_page_mount_start_ms"),
      messenger_room_entry_page_mount_end_ms: pickNum(snap, "messenger_room_entry_page_mount_end_ms"),
      messenger_room_entry_first_client_component_mount_ms: pickNum(
        snap,
        "messenger_room_entry_first_client_component_mount_ms"
      ),
      messenger_room_entry_useMessengerRoomClientPhase1_init_ms: pickNum(
        snap,
        "messenger_room_entry_useMessengerRoomClientPhase1_init_ms"
      ),
      messenger_room_entry_room_bootstrap_request_start_ms: pickNum(
        snap,
        "messenger_room_entry_room_bootstrap_request_start_ms"
      ),
      messenger_room_entry_room_bootstrap_primed_followup_request_start_ms: pickNum(
        snap,
        "messenger_room_entry_room_bootstrap_primed_followup_request_start_ms"
      ),
      messenger_room_entry_room_bootstrap_response_end_ms: pickNum(
        snap,
        "messenger_room_entry_room_bootstrap_response_end_ms"
      ),
      messenger_room_entry_room_bootstrap_primed_followup_response_end_ms: pickNum(
        snap,
        "messenger_room_entry_room_bootstrap_primed_followup_response_end_ms"
      ),
      messenger_room_entry_room_bootstrap_json_parse_complete_ms: pickNum(
        snap,
        "messenger_room_entry_room_bootstrap_json_parse_complete_ms"
      ),
      messenger_room_entry_room_bootstrap_primed_followup_json_parse_complete_ms: pickNum(
        snap,
        "messenger_room_entry_room_bootstrap_primed_followup_json_parse_complete_ms"
      ),
      messenger_room_entry_phase1_start_ms: pickNum(snap, "messenger_room_entry_phase1_start_ms"),
      messenger_room_entry_phase1_snapshot_prepare_ms: pickNum(
        snap,
        "messenger_room_entry_phase1_snapshot_prepare_ms"
      ),
      messenger_room_entry_phase1_local_cache_read_start_ms: pickNum(
        snap,
        "messenger_room_entry_phase1_local_cache_read_start_ms"
      ),
      messenger_room_entry_phase1_local_cache_read_end_ms: pickNum(
        snap,
        "messenger_room_entry_phase1_local_cache_read_end_ms"
      ),
      messenger_room_entry_phase1_snapshot_commit_ms: pickNum(
        snap,
        "messenger_room_entry_phase1_snapshot_commit_ms"
      ),
      messenger_room_entry_json_parse_complete_ms: pickNum(snap, "messenger_room_entry_json_parse_complete_ms"),
      messenger_room_entry_phase2_enter_ms: pickNum(snap, "messenger_room_entry_phase2_enter_ms"),
      messenger_room_entry_room_state_commit_ms: pickNum(snap, "messenger_room_entry_room_state_commit_ms"),
      messenger_room_entry_messages_state_commit_ms: pickNum(snap, "messenger_room_entry_messages_state_commit_ms"),
      messenger_room_entry_to_paint_ms: pickNum(snap, "messenger_room_entry_to_paint_ms"),
      messenger_room_entry_initial_messages_merge_map_index_ms: pickNum(
        snap,
        "messenger_room_entry_initial_messages_merge_map_index_ms"
      ),
      messenger_room_entry_initial_messages_merge_dedupe_ms: pickNum(
        snap,
        "messenger_room_entry_initial_messages_merge_dedupe_ms"
      ),
      messenger_room_entry_initial_messages_merge_normalize_ms: pickNum(
        snap,
        "messenger_room_entry_initial_messages_merge_normalize_ms"
      ),
      messenger_room_entry_initial_messages_merge_sort_ms: pickNum(
        snap,
        "messenger_room_entry_initial_messages_merge_sort_ms"
      ),
      messenger_room_entry_participants_state_commit_ms: pickNum(snap, "messenger_room_entry_participants_state_commit_ms"),
      messenger_room_entry_profiles_state_commit_ms: pickNum(snap, "messenger_room_entry_profiles_state_commit_ms"),
      messenger_room_entry_composer_mount_ms: pickNum(snap, "messenger_room_entry_composer_mount_ms"),
      messenger_room_entry_composer_textarea_visible_ms: pickNum(snap, "messenger_room_entry_composer_textarea_visible_ms"),
      messenger_room_entry_read_mark_effect_start_ms: pickNum(snap, "messenger_room_entry_read_mark_effect_start_ms"),
      messenger_room_entry_read_mark_effect_end_ms: pickNum(snap, "messenger_room_entry_read_mark_effect_end_ms"),
      messenger_room_entry_presence_effect_start_ms: pickNum(snap, "messenger_room_entry_presence_effect_start_ms"),
      messenger_room_entry_presence_effect_end_ms: pickNum(snap, "messenger_room_entry_presence_effect_end_ms"),
      messenger_room_entry_first_message_render_ms: pickNum(snap, "messenger_room_entry_first_message_render_ms"),
      messenger_room_entry_phase2_rerender_count: pickNum(snap, "messenger_room_entry_phase2_rerender_count"),
      messenger_room_entry_phase2_use_effect_count: pickNum(snap, "messenger_room_entry_phase2_use_effect_count"),
      messenger_room_entry_phase2_use_layout_effect_count: pickNum(snap, "messenger_room_entry_phase2_use_layout_effect_count"),
      messenger_room_entry_room_state_commit_count: pickNum(snap, "messenger_room_entry_room_state_commit_count"),
      messenger_room_entry_messages_state_commit_count: pickNum(snap, "messenger_room_entry_messages_state_commit_count"),
      messenger_room_entry_participants_state_commit_count: pickNum(snap, "messenger_room_entry_participants_state_commit_count"),
      messenger_room_entry_profiles_state_commit_count: pickNum(snap, "messenger_room_entry_profiles_state_commit_count"),
      messenger_room_entry_read_mark_effect_count: pickNum(snap, "messenger_room_entry_read_mark_effect_count"),
      messenger_room_entry_presence_effect_count: pickNum(snap, "messenger_room_entry_presence_effect_count"),
    };

    // eslint-disable-next-line no-console
    console.log("\n=== MESSENGER_ROOM_ENTRY_PERF_JSON ===\n" + JSON.stringify(result, null, 2) + "\n=== END ===\n");

    const seg = (a: number | null, b: number | null): number | null =>
      a != null && b != null ? b - a : null;
    const rscDone =
      result.messenger_room_entry_route_module_request_end_ms ??
      result.messenger_room_entry_client_chunk_request_end_ms;
    /** `page_module_eval_*` 는 청크 로드 시점이라 RSC 종료보다 앞설 수 있음 — 방 페이지 클라 마운트를 hydration 프록시로 쓴다 */
    const hydrationStart = result.messenger_room_entry_page_mount_start_ms;
    const componentMount = result.messenger_room_entry_first_client_component_mount_ms;
    const phase1Done = result.messenger_room_entry_phase1_snapshot_commit_ms;
    const composerMount = result.messenger_room_entry_composer_mount_ms;
    const textareaVisible = result.messenger_room_entry_composer_textarea_visible_ms;
    const timeline = {
      route_start_to_rsc_done_ms: seg(0, rscDone ?? null),
      rsc_done_to_hydration_start_ms: seg(rscDone ?? null, hydrationStart),
      hydration_start_to_component_mount_ms: seg(hydrationStart, componentMount),
      component_mount_to_phase1_done_ms: seg(componentMount, phase1Done),
      phase1_done_to_composer_mount_ms: seg(phase1Done, composerMount),
      composer_mount_to_textarea_visible_ms: seg(composerMount, textareaVisible),
    };
    // eslint-disable-next-line no-console
    console.log("MESSENGER_ROOM_ENTRY_TIMELINE_JSON:" + JSON.stringify(timeline));

    expect(result.messenger_room_entry_first_message_render_ms).not.toBeNull();
    expect(result.messenger_room_entry_phase2_enter_ms).not.toBeNull();
    expect(result.messenger_room_entry_composer_mount_ms).not.toBeNull();
  });
});
