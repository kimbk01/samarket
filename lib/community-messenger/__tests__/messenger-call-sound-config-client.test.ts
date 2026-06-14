import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveClientAuthenticatedUserIdForFetch = vi.fn<() => Promise<string | null>>();
let syncViewerUserId: string | undefined;

vi.mock("@/lib/auth/resolve-client-authenticated-user-id-for-fetch", () => ({
  resolveClientAuthenticatedUserIdForFetch: () => resolveClientAuthenticatedUserIdForFetch(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: () => syncViewerUserId,
  getCurrentUserIdForDb: async () => syncViewerUserId ?? null,
}));

describe("messenger-call-sound-config-client", () => {
  beforeEach(() => {
    vi.resetModules();
    syncViewerUserId = undefined;
    resolveClientAuthenticatedUserIdForFetch.mockReset();
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, config: null }), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadModule() {
    const mod = await import("@/lib/community-messenger/messenger-call-sound-config-client");
    mod.resetMessengerCallSoundConfigClientForTests();
    return mod;
  }

  it("returns default config with zero fetch when session is null", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue(null);
    const mod = await loadModule();

    const cfg = await mod.fetchMessengerCallSoundConfig();

    expect(fetch).not.toHaveBeenCalled();
    expect(cfg?.incoming_ring_timeout_seconds).toBe(30);
    expect(mod.getMessengerCallSoundConfigCache()?.incoming_ring_timeout_seconds).toBe(30);
  });

  it("does not retry after 401", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }))
    );
    const mod = await loadModule();

    const cfg = await mod.fetchMessengerCallSoundConfig();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cfg?.incoming_ring_timeout_seconds).toBe(30);
  });

  it("blocks force:true fetch during unauthorized backoff after 401", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadModule();

    await mod.fetchMessengerCallSoundConfig();
    await mod.fetchMessengerCallSoundConfig({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches once when session exists", async () => {
    syncViewerUserId = "user-1";
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    const serverConfig = {
      voice_incoming_enabled: true,
      voice_incoming_sound_url: "https://example.com/in.wav",
      voice_outgoing_ringback_enabled: true,
      voice_outgoing_ringback_url: null,
      video_incoming_enabled: true,
      video_incoming_sound_url: null,
      video_outgoing_ringback_enabled: true,
      video_outgoing_ringback_url: null,
      missed_notification_enabled: true,
      missed_notification_sound_url: null,
      call_end_enabled: true,
      call_end_sound_url: null,
      use_custom_sounds: true,
      default_fallback_sound_url: null,
      incoming_ring_timeout_seconds: 45,
      incoming_ringtone_volume: 0.5,
      busy_auto_reject_enabled: false,
      repeated_call_cooldown_seconds: 0,
      suppress_incoming_local_notifications: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, config: serverConfig }), { status: 200 }))
    );
    const mod = await loadModule();

    const cfg = await mod.fetchMessengerCallSoundConfig();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cfg?.incoming_ring_timeout_seconds).toBe(45);
    await mod.fetchMessengerCallSoundConfig();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears unauthorized backoff when sync session is confirmed", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            config: {
              voice_incoming_enabled: true,
              voice_incoming_sound_url: null,
              voice_outgoing_ringback_enabled: true,
              voice_outgoing_ringback_url: null,
              video_incoming_enabled: true,
              video_incoming_sound_url: null,
              video_outgoing_ringback_enabled: true,
              video_outgoing_ringback_url: null,
              missed_notification_enabled: true,
              missed_notification_sound_url: null,
              call_end_enabled: true,
              call_end_sound_url: null,
              use_custom_sounds: true,
              default_fallback_sound_url: null,
              incoming_ring_timeout_seconds: 55,
              incoming_ringtone_volume: 0.72,
              busy_auto_reject_enabled: false,
              repeated_call_cooldown_seconds: 0,
              suppress_incoming_local_notifications: false,
            },
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadModule();

    await mod.fetchMessengerCallSoundConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    syncViewerUserId = "user-1";
    const cfg = await mod.fetchMessengerCallSoundConfig({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cfg?.incoming_ring_timeout_seconds).toBe(55);
  });
});
