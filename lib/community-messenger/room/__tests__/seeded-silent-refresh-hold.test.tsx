/** @vitest-environment jsdom */
/**
 * B2b — 시드 진입 silent refresh 보류 해제.
 * 제품에 마운트되는 composer 는 phase2 모드(`CommunityMessengerRoomClientPhase2Body`)이므로 phase2 composer 준비로 해제돼야 한다.
 * 해제 조건: 같은 hold 세대 · 신호 방 = 적용 스냅샷 방 · placeholder 아닌 정상 시드 · 실제 composer 준비.
 * 화면 이탈은 대기 refresh 를 풀고, 이전 방의 늦은 신호는 무시한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useCallback, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSeededSilentRefreshHold,
  type SeededSilentHoldSignal,
} from "@/lib/community-messenger/room/seeded-silent-refresh-hold";
import { useSeededSilentHoldComposerRelease } from "@/lib/community-messenger/room/use-seeded-silent-hold-composer-release";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  peekDetachedCommunityCallSessionId,
  readAndroidOsPipCallSessionId,
  readDockedCallSessionId,
} from "@/lib/community-messenger/call-presentation-ownership";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = join(__dirname, "../../../..");

function snap(roomId: string, extra?: Partial<CommunityMessengerRoomSnapshot>): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "viewer-1",
    room: { id: roomId, roomType: "private_group", lastMessage: "" },
    members: [],
    messages: [],
    myRole: "owner",
    activeCall: null,
    ...extra,
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("B2b 계약 — 제품 composer(phase2 모드)가 보류를 해제한다", () => {
  it("Phase2Body 는 phase2 모드 composer 를 마운트하고, composer 는 phase2 모드 해제 경로를 가진다", () => {
    const body = readFileSync(join(ROOT, "components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx"), "utf8");
    expect(body).toMatch(/<CommunityMessengerRoomPhase2Composer[^>]*composerSurfaceMode="phase2"/);
    const composer = readFileSync(
      join(ROOT, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"),
      "utf8"
    );
    expect(composer).toMatch(/useSeededSilentHoldComposerRelease\(\{\s*enabled: composerSurfaceMode === "phase2"/);
    expect(composer).toMatch(/onTextareaRef=\{onSeededHoldTextareaNode\}/);
  });

  it("입력창 준비 확인은 프레임 수·타이머 제한 없이 이벤트로만 다시 확인한다", () => {
    const hook = readFileSync(join(ROOT, "lib/community-messenger/room/use-seeded-silent-hold-composer-release.ts"), "utf8");
    expect(hook).not.toMatch(/requestAnimationFrame|setTimeout|setInterval|MAX_VISIBILITY_FRAMES/);
    expect(hook).toMatch(/new MutationObserver/);
  });
});

describe("hold 해제 조건", () => {
  it("시드 없음: 보류 없음", () => {
    const h = createSeededSilentRefreshHold();
    h.arm(false);
    expect(h.pending()).toBeNull();
    expect(h.activeGeneration()).toBe(0);
  });

  it("activeGeneration 은 보류 중인 세대만, 해제 뒤 0", () => {
    const h = createSeededSilentRefreshHold();
    const gen = h.arm(true);
    expect(h.activeGeneration()).toBe(gen);
    h.release({ roomId: "room-a", generation: gen }, snap("room-a"));
    expect(h.activeGeneration()).toBe(0);
  });

  it("세대 불일치 · 방 불일치 · placeholder · 미완 시드 · 신호 없음은 해제하지 않는다", () => {
    const h = createSeededSilentRefreshHold();
    const gen = h.arm(true);
    const ok: SeededSilentHoldSignal = { roomId: "room-a", generation: gen };
    expect(h.release({ ...ok, generation: gen - 1 }, snap("room-a"))).toBe(false);
    expect(h.release({ ...ok, roomId: "room-b" }, snap("room-a"))).toBe(false);
    expect(h.release(ok, snap("room-a", { clientShellPlaceholder: true }))).toBe(false);
    expect(h.release(ok, snap("room-a", { room: { id: "room-a", lastMessage: "hi" } } as never))).toBe(false);
    expect(h.release(ok, null)).toBe(false);
    expect(h.release(undefined, snap("room-a"))).toBe(false);
    expect(h.pending()).not.toBeNull();
    expect(h.release(ok, snap("room-a"))).toBe(true);
    expect(h.pending()).toBeNull();
  });

  it("화면 이탈(disarm)은 대기 refresh 를 푼다 · 이미 다음 세대면 새 보류를 건드리지 않는다", async () => {
    const h = createSeededSilentRefreshHold();
    const g1 = h.arm(true);
    const waiting = h.pending()!;
    const g2 = h.arm(true);
    await expect(waiting).resolves.toBeUndefined();
    h.disarm(g1);
    expect(h.pending()).not.toBeNull();
    h.disarm(g2);
    expect(h.pending()).toBeNull();
  });

  it("방 전환 뒤 이전 방 신호는 무시", () => {
    const h = createSeededSilentRefreshHold();
    const gA = h.arm(true);
    const gB = h.arm(true);
    expect(h.release({ roomId: "room-a", generation: gA }, snap("room-a"))).toBe(false);
    expect(h.release({ roomId: "room-b", generation: gB }, snap("room-b"))).toBe(true);
  });
});

/* ── 통합: phase1 refresh 보류 + phase2 composer 준비 + 그룹 설정 저장(await refresh(true)) ── */

type Harness = {
  network: ReturnType<typeof vi.fn>;
  busyLog: Array<string | null>;
  save: () => Promise<void>;
  silent: () => Promise<void>;
  setSnapshot: (s: CommunityMessengerRoomSnapshot) => void;
  setTextareaVisible: (v: boolean) => void;
  setWrapperHidden: (v: boolean) => void;
  setVoiceRecording: (v: boolean) => void;
  setUnavailable: (v: boolean) => void;
  notify: ReturnType<typeof vi.fn>;
};

/** 실제 DOM 가시성 — textarea style 또는 조상 hidden 속성 */
const isVisible = (ta: HTMLTextAreaElement) => ta.style.display !== "none" && !ta.closest("[hidden]");
let initialTextareaVisible = true;

function RoomHarness({
  roomId,
  seed,
  out,
  networkImpl,
}: {
  roomId: string;
  seed: CommunityMessengerRoomSnapshot;
  out: { current: Harness | null };
  networkImpl: () => Promise<void>;
}) {
  const holdRef = useRef(createSeededSilentRefreshHold());
  const armRef = useRef<string | null>(null);
  if (armRef.current !== roomId) {
    armRef.current = roomId;
    holdRef.current.arm(true);
  }
  const [snapshot, setSnapshot] = useState(seed);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [busy, setBusy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const network = useRef(vi.fn(networkImpl)).current;
  const busyLog = useRef<Array<string | null>>([]).current;
  busyLog.push(busy);

  const refresh = useCallback(async (silent: boolean) => {
    if (silent) {
      const p = holdRef.current.pending();
      if (p) await p;
    }
    await network();
  }, [network]);
  const save = useCallback(async () => {
    setBusy("group-settings");
    try {
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }, [refresh]);
  const notify = useRef(
    vi.fn((signal: SeededSilentHoldSignal) => holdRef.current.release(signal, snapshotRef.current))
  ).current;
  const readGeneration = useCallback(() => holdRef.current.activeGeneration(), []);

  const onTextareaNode = useSeededSilentHoldComposerRelease({
    enabled: true,
    roomId: snapshot.room.id,
    snapshotPlaceholder: Boolean(snapshot.clientShellPlaceholder),
    chatUnavailable: unavailable,
    isTextareaVisible: isVisible,
    readGeneration,
    notify,
  });

  out.current = {
    network,
    busyLog,
    save,
    silent: () => refresh(true),
    setSnapshot,
    setTextareaVisible: (v) => {
      if (textareaRef.current) textareaRef.current.style.display = v ? "" : "none";
    },
    setWrapperHidden: (v) => {
      if (v) wrapperRef.current?.setAttribute("hidden", "");
      else wrapperRef.current?.removeAttribute("hidden");
    },
    setVoiceRecording,
    setUnavailable,
    notify,
  };
  if (unavailable) return <div data-unavailable />;
  return (
    <div ref={wrapperRef}>
      {voiceRecording ? (
        <div data-voice-pane />
      ) : (
        <textarea
          /* 제품 MessengerComposerSector 와 같이 렌더마다 새 인라인 ref 콜백 */
          ref={(node) => {
            textareaRef.current = node;
            if (node && !initialTextareaVisible && !node.dataset.init) {
              node.dataset.init = "1";
              node.style.display = "none";
            }
            onTextareaNode(node);
          }}
        />
      )}
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  initialTextareaVisible = true;
  clearAllCommunityCallLocalSessionFlags();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clearAllCommunityCallLocalSessionFlags();
});

let mountSeq = 0;
async function mount(roomId: string, seed: CommunityMessengerRoomSnapshot, networkImpl = async () => undefined) {
  const out: { current: Harness | null } = { current: null };
  mountSeq += 1;
  await act(async () => {
    root.render(<RoomHarness key={`${roomId}:${mountSeq}`} roomId={roomId} seed={seed} out={out} networkImpl={networkImpl} />);
  });
  return out;
}

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe("B2b 통합 — 그룹 설정·공지·초대 저장 busy 해제", () => {
  it("composer 준비(textarea 보임)로 보류 해제 → await refresh(true) 완료 · busy 해제", async () => {
    const h = await mount("room-a", snap("room-a"));
    await act(async () => {
      await h.current!.save();
    });
    expect(h.current!.network).toHaveBeenCalledTimes(1);
    expect(h.current!.busyLog.at(-1)).toBeNull();
  });

  it("textarea 가 아직 안 보이면 보류 유지 → 보이면 해제(DOM 가시성 변경 이벤트)", async () => {
    initialTextareaVisible = false;
    const h = await mount("room-a", snap("room-a"));
    let done = false;
    await act(async () => {
      void h.current!.save().then(() => (done = true));
    });
    await flush();
    expect(done).toBe(false);
    expect(h.current!.network).not.toHaveBeenCalled();
    await act(async () => h.current!.setTextareaVisible(true));
    await flush();
    expect(done).toBe(true);
    expect(h.current!.network).toHaveBeenCalledTimes(1);
  });

  it("48프레임(약 0.8초)보다 늦게 보여도, busy 등 다른 상태 변화 없이 해제", async () => {
    initialTextareaVisible = false;
    const h = await mount("room-a", snap("room-a"));
    let done = false;
    await act(async () => {
      void h.current!.save().then(() => (done = true));
    });
    await wait(1_500);
    expect(done).toBe(false);
    await act(async () => h.current!.setTextareaVisible(true));
    await flush();
    expect(done).toBe(true);
    expect(h.current!.busyLog.at(-1)).toBeNull();
  });

  it("조상 요소가 숨김→표시로 바뀌어도 해제", async () => {
    initialTextareaVisible = false;
    const g = await mount("room-g", snap("room-g"));
    let done = false;
    await act(async () => {
      g.current!.setWrapperHidden(true);
      g.current!.setTextareaVisible(true);
    });
    await flush();
    await act(async () => {
      void g.current!.silent().then(() => (done = true));
    });
    await flush();
    expect(done).toBe(false);
    await act(async () => g.current!.setWrapperHidden(false));
    await flush();
    expect(done).toBe(true);
  });

  it("textarea 가 언마운트(음성 녹음 패널)됐다가 다시 마운트되면 새 노드 기준으로 해제", async () => {
    initialTextareaVisible = false;
    const h = await mount("room-a", snap("room-a"));
    let done = false;
    await act(async () => {
      void h.current!.silent().then(() => (done = true));
    });
    await act(async () => h.current!.setVoiceRecording(true));
    await flush();
    expect(done).toBe(false);
    initialTextareaVisible = true;
    await act(async () => h.current!.setVoiceRecording(false));
    await flush();
    expect(done).toBe(true);
  });

  it("보류가 없으면(해제 뒤 · 시드 없음) 감시·신호를 만들지 않는다", async () => {
    const h = await mount("room-a", snap("room-a"));
    await flush();
    const calls = h.current!.notify.mock.calls.length;
    expect(calls).toBe(1);
    await act(async () => {
      h.current!.setTextareaVisible(false);
      h.current!.setTextareaVisible(true);
      h.current!.setVoiceRecording(true);
    });
    await act(async () => h.current!.setVoiceRecording(false));
    await flush();
    expect(h.current!.notify.mock.calls.length).toBe(calls);
  });

  it("placeholder 시드는 해제하지 않는다 → 정상 서버 스냅샷 적용 뒤 해제", async () => {
    const h = await mount("room-a", snap("room-a", { clientShellPlaceholder: true }));
    let done = false;
    await act(async () => {
      void h.current!.silent().then(() => (done = true));
    });
    await flush();
    expect(done).toBe(false);
    await act(async () => h.current!.setSnapshot(snap("room-a")));
    await flush();
    expect(done).toBe(true);
  });

  it("입력 불가 방(안내 줄)도 composer 준비로 본다", async () => {
    initialTextareaVisible = false;
    const h = await mount("room-a", snap("room-a", { clientShellPlaceholder: true }));
    await act(async () => h.current!.setUnavailable(true));
    await act(async () => h.current!.setSnapshot(snap("room-a")));
    let done = false;
    await act(async () => {
      void h.current!.silent().then(() => (done = true));
    });
    await flush();
    expect(done).toBe(true);
  });

  it("refresh 실패·지연: 저장 busy 는 실패에도 해제 · 지연은 응답 뒤 해제", async () => {
    const fail = await mount("room-f", snap("room-f"), async () => {
      throw new Error("network");
    });
    await act(async () => {
      await fail.current!.save().catch(() => undefined);
    });
    expect(fail.current!.busyLog.at(-1)).toBeNull();

    vi.useFakeTimers();
    try {
      const slow = await mount("room-s", snap("room-s"), () => new Promise((r) => setTimeout(r, 3_000)));
      let done = false;
      await act(async () => {
        void slow.current!.save().then(() => (done = true));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(done).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_100);
      });
      expect(done).toBe(true);
      expect(slow.current!.busyLog.at(-1)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Realtime silent refresh 여러 개가 대기 중이어도 해제 시 모두 진행", async () => {
    initialTextareaVisible = false;
    const h = await mount("room-a", snap("room-a"));
    const results: string[] = [];
    await act(async () => {
      void h.current!.silent().then(() => results.push("rt1"));
      void h.current!.silent().then(() => results.push("rt2"));
      void h.current!.save().then(() => results.push("save"));
    });
    await flush();
    expect(results).toEqual([]);
    await act(async () => h.current!.setTextareaVisible(true));
    await flush();
    expect(results.sort()).toEqual(["rt1", "rt2", "save"]);
  });

  it("방 이탈(언마운트) 뒤 재진입: 새 세대로 다시 보류·해제", async () => {
    initialTextareaVisible = false;
    const a = await mount("room-a", snap("room-a"));
    let waitingDone = false;
    await act(async () => {
      void a.current!.silent().then(() => (waitingDone = true));
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    initialTextareaVisible = true;
    const again = await mount("room-a", snap("room-a"));
    await act(async () => {
      await again.current!.save();
    });
    expect(again.current!.network).toHaveBeenCalledTimes(1);
    expect(waitingDone).toBe(false);
  });

  it("통화 보호: 보류 해제 후 silent 스냅샷 갱신(activeCall null)이 dock·Android PiP·detached 를 건드리지 않는다", async () => {
    const cleanup = vi.fn(async () => undefined);
    dockCommunityCall({ sessionId: "call-dock", roomId: "room-a", cleanup });
    const h = await mount("room-a", snap("room-a"));
    await act(async () => {
      await h.current!.save();
      h.current!.setSnapshot(snap("room-a", { activeCall: null }));
    });
    expect(readDockedCallSessionId()).toBe("call-dock");
    expect(peekDetachedCommunityCallSessionId()).toBe("call-dock");
    enterAndroidOsPipCommunityCall({ sessionId: "call-dock", roomId: "room-a", cleanup });
    await act(async () => {
      await h.current!.silent();
      h.current!.setSnapshot(snap("room-a", { activeCall: null, messages: [] }));
    });
    expect(readAndroidOsPipCallSessionId()).toBe("call-dock");
    expect(cleanup).not.toHaveBeenCalled();
  });
});
