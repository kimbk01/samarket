// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-client-membership-state", () => ({
  useClientMembershipState: () => membershipRef.current,
}));

const membershipRef: { current: { status: "member"; profile: { id: string } } | { status: "guest" } } = {
  current: { status: "member", profile: { id: "u1" } },
};

import { MainHubKeepAliveProvider, MainHubKeepAliveSlot } from "@/components/layout/MainHubKeepAlive";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounts: string[] = [];
const effects: string[] = [];

function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0);
  // 컴포넌트 인스턴스 생성 시 1회만 (효과 재실행과 구분)
  useState(() => {
    mounts.push(name);
    return null;
  });
  useEffect(() => {
    effects.push(`on:${name}`);
    return () => {
      effects.push(`off:${name}`);
    };
  }, [name]);
  return (
    <button type="button" data-hub={name} onClick={() => setN((v) => v + 1)}>
      {name}:{n}
    </button>
  );
}

function Route({ path }: { path: string }) {
  if (path === "/chat") {
    return (
      <MainHubKeepAliveSlot hubId="community">
        <Counter name="chat" />
      </MainHubKeepAliveSlot>
    );
  }
  if (path === "/stores") {
    return (
      <MainHubKeepAliveSlot hubId="delivery">
        <Counter name="delivery" />
      </MainHubKeepAliveSlot>
    );
  }
  return <p data-detail="1">detail</p>;
}

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLElement | null = null;

function render(path: string) {
  act(() => {
    root!.render(
      <MainHubKeepAliveProvider>
        <main>
          <Route path={path} />
        </main>
      </MainHubKeepAliveProvider>
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  mounts.length = 0;
  effects.length = 0;
  membershipRef.current = { status: "member", profile: { id: "u1" } };
});

function setup() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
}

describe("MainHubKeepAlive — 하단 탭 허브 유지 (설계 §2-1)", () => {
  it("다른 탭에 다녀와도 허브 상태가 그대로이고 다시 만들지 않는다", () => {
    setup();
    render("/chat");
    const btn = () => host!.querySelector<HTMLButtonElement>('[data-hub="chat"]');
    expect(btn()?.textContent).toBe("chat:0");
    act(() => btn()!.click());
    act(() => btn()!.click());
    expect(btn()?.textContent).toBe("chat:2");

    render("/stores");
    // 보관 중인 채팅 허브는 문서 밖
    expect(host!.querySelector('[data-hub="chat"]')).toBeNull();
    expect(host!.querySelector('[data-hub="delivery"]')?.textContent).toBe("delivery:0");

    render("/chat");
    expect(btn()?.textContent).toBe("chat:2");
    expect(mounts.filter((m) => m === "chat")).toHaveLength(1);
  });

  it("숨김 허브는 효과를 정리하고 다시 보이면 효과를 다시 실행한다", () => {
    setup();
    render("/chat");
    render("/detail");
    render("/chat");
    expect(effects).toEqual(["on:chat", "off:chat", "on:chat"]);
  });

  it("허브 자리는 허브 화면을 자기 위치에 보여 준다 (DOM 위치 = 페이지 자리)", () => {
    setup();
    render("/stores");
    const slot = host!.querySelector('[data-main-hub-keep-alive-slot="delivery"]');
    expect(slot?.querySelector('[data-hub="delivery"]')).not.toBeNull();
  });

  it("다른 계정으로 바뀌면 보관 허브를 버린다", () => {
    setup();
    render("/chat");
    act(() => host!.querySelector<HTMLButtonElement>('[data-hub="chat"]')!.click());
    render("/stores");
    membershipRef.current = { status: "member", profile: { id: "u2" } };
    render("/stores");
    render("/chat");
    expect(host!.querySelector('[data-hub="chat"]')?.textContent).toBe("chat:0");
  });

  it("제공자 밖에서는 children 을 그대로 그린다", () => {
    setup();
    act(() => {
      root!.render(
        <MainHubKeepAliveSlot hubId="home">
          <Counter name="home" />
        </MainHubKeepAliveSlot>
      );
    });
    expect(host!.querySelector('[data-hub="home"]')).not.toBeNull();
    expect(host!.querySelector("[data-main-hub-keep-alive-slot]")).toBeNull();
  });
});
