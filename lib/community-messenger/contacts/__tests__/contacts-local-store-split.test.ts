// @vitest-environment jsdom
/**
 * 기기 저장값 분리 (실기 감사 2026-11-11) — 작은 상태 / 번호표 / 이름표.
 * 자주 지나는 경로(친구 탭·화면 이동·목록 받기)가 큰 값을 읽지 않는지, 옛 값이 1번 나뉘는지, 회원 전환·삭제가 3개 모두 지우는지.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTACTS_LOCAL_PREFIX,
  applyContactsListToLocal,
  clearContactsDeviceData,
  findLocalNumberByRef,
  patchContactsLocalState,
  purgeOtherUsersContactsLocalState,
  readContactsConsentedFlag,
  readContactsLocalState,
  readContactsNames,
  readContactsNumbers,
  readContactsRevokePendingFlag,
  shrinkContactsDeviceDataToListed,
  writeContactsNames,
  writeContactsNumbers,
} from "@/lib/community-messenger/contacts/contacts-local-store";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

const U = "user-a";
const KEY = CONTACTS_LOCAL_PREFIX + U;

function member(id: string, ref: string | null, onThisDevice = true): ContactsMemberRow {
  return {
    user_id: id,
    nickname: id,
    username: id,
    dibay_id: id,
    avatar_url: null,
    client_ref: ref,
    request_state: "none",
    on_this_device: onThisDevice,
    recently_joined: false,
  } as ContactsMemberRow;
}

/** 큰 주소록 (n 명) */
function bigBook(n: number) {
  const numbers: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (let i = 0; i < n; i += 1) {
    numbers[`+63917${String(1000000 + i)}`] = `ref-${i}`;
    names[`ref-${i}`] = `Name ${i}`;
  }
  return { numbers, names };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("작은 상태와 큰 값 분리", () => {
  it("번호표·이름표는 따로 저장되고 작은 상태에는 개수·보이는 회원 이름만 있다", () => {
    const { numbers, names } = bigBook(3000);
    patchContactsLocalState(U, { consented: true, members: [member("m1", "ref-1"), member("m2", "ref-2")] });
    writeContactsNumbers(U, numbers);
    writeContactsNames(U, names);
    const small = localStorage.getItem(KEY) ?? "";
    expect(small.length).toBeLessThan(2000);
    expect(small).not.toContain("+63917");
    const st = readContactsLocalState(U);
    expect(st.numbersCount).toBe(3000);
    expect(st.memberNames).toEqual({ "ref-1": "Name 1", "ref-2": "Name 2" });
    expect(Object.keys(readContactsNumbers(U) ?? {}).length).toBe(3000);
    expect(Object.keys(readContactsNames(U)).length).toBe(3000);
    expect(findLocalNumberByRef(readContactsNumbers(U), "ref-2")).toBe("+639171000002");
  });

  it("자주 지나는 경로(작은 상태 읽기·동의/철회 표시·상태 쓰기)는 큰 값을 읽지 않는다", () => {
    const { numbers, names } = bigBook(3000);
    patchContactsLocalState(U, { consented: true, revokePending: true });
    writeContactsNumbers(U, numbers);
    writeContactsNames(U, names);
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    readContactsLocalState(U);
    readContactsConsentedFlag(U);
    readContactsRevokePendingFlag(U);
    patchContactsLocalState(U, { lastPermission: "granted" });
    const keys = getItem.mock.calls.map((c) => c[0]);
    expect(keys.every((k) => k === KEY)).toBe(true);
    expect(readContactsConsentedFlag(U)).toBe(true);
    expect(readContactsRevokePendingFlag(U)).toBe(true);
  });

  it("목록 받기: 보이는 회원 이름이 이미 있으면 이름표를 읽지 않고, 새 회원이 생기면 그때만 읽는다", () => {
    const { names } = bigBook(50);
    patchContactsLocalState(U, { members: [member("m1", "ref-1")] });
    writeContactsNames(U, names);
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    applyContactsListToLocal(U, { members: [member("m1", "ref-1")], friendIds: [], knownRefs: [], friendRefs: {}, listToken: "t1" });
    expect(getItem.mock.calls.some((c) => String(c[0]).endsWith("#m"))).toBe(false);
    getItem.mockClear();
    const st = applyContactsListToLocal(U, {
      members: [member("m1", "ref-1"), member("m5", "ref-5")],
      friendIds: [],
      knownRefs: [],
      friendRefs: {},
      listToken: "t2",
    });
    expect(getItem.mock.calls.some((c) => String(c[0]).endsWith("#m"))).toBe(true);
    expect(st.memberNames).toEqual({ "ref-1": "Name 1", "ref-5": "Name 5" });
    expect(st.listToken).toBe("t2");
  });
});

describe("옛 한 덩어리 값 옮기기", () => {
  it("numbers·names 가 든 옛 값은 처음 읽을 때 3개로 나뉘고 내용은 그대로", () => {
    const { numbers, names } = bigBook(10);
    localStorage.setItem(
      KEY,
      JSON.stringify({ consented: true, sourceId: "s1", numbers, names, members: [member("m3", "ref-3")], listToken: "old" })
    );
    const st = readContactsLocalState(U);
    expect(st.consented).toBe(true);
    expect(st.sourceId).toBe("s1");
    expect(st.numbersCount).toBe(10);
    expect(st.memberNames).toEqual({ "ref-3": "Name 3" });
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect("numbers" in raw).toBe(false);
    expect("names" in raw).toBe(false);
    expect(readContactsNumbers(U)).toEqual(numbers);
    expect(readContactsNames(U)).toEqual(names);
  });

  it("옛 값의 numbers 가 null 이면 번호표 없음 (다음 동기화가 전체 스냅숏)", () => {
    localStorage.setItem(KEY, JSON.stringify({ consented: true, numbers: null, names: {} }));
    expect(readContactsLocalState(U).numbersCount).toBeNull();
    expect(readContactsNumbers(U)).toBeNull();
  });
});

describe("지우기·회원 전환", () => {
  it("다른 회원이 로그인하면 이전 회원의 3개 값이 모두 지워지고 내 값은 남는다", () => {
    const { numbers, names } = bigBook(5);
    patchContactsLocalState("other", { consented: true });
    writeContactsNumbers("other", numbers);
    writeContactsNames("other", names);
    patchContactsLocalState(U, { consented: true });
    writeContactsNumbers(U, numbers);
    writeContactsNames(U, names);
    purgeOtherUsersContactsLocalState(U);
    const keys = Object.keys(localStorage);
    expect(keys.filter((k) => k.includes("other"))).toEqual([]);
    expect(keys.sort()).toEqual([KEY, KEY + "#m", KEY + "#n"].sort());
  });

  it("이 기기 연락처 삭제는 번호표·이름표까지 지운다", () => {
    const { numbers, names } = bigBook(5);
    patchContactsLocalState(U, { consented: true, sourceId: "s1" });
    writeContactsNumbers(U, numbers);
    writeContactsNames(U, names);
    const st = clearContactsDeviceData(U);
    expect(st.numbersCount).toBeNull();
    expect(st.memberNames).toEqual({});
    expect(localStorage.getItem(KEY + "#n")).toBeNull();
    expect(localStorage.getItem(KEY + "#m")).toBeNull();
    expect(readContactsLocalState(U).consented).toBe(true);
  });

  it("업로드 멈춤(권한 철회 등): 번호표 삭제 · 이름표는 보이는 회원 것만", () => {
    const { numbers, names } = bigBook(20);
    patchContactsLocalState(U, { members: [member("m7", "ref-7")] });
    writeContactsNumbers(U, numbers);
    writeContactsNames(U, names);
    const st = shrinkContactsDeviceDataToListed(U);
    expect(st.numbersCount).toBeNull();
    expect(readContactsNumbers(U)).toBeNull();
    expect(readContactsNames(U)).toEqual({ "ref-7": "Name 7" });
    expect(st.memberNames).toEqual({ "ref-7": "Name 7" });
  });

  it("번호표 저장 실패(저장 공간 부족)면 번호표 없음으로 둔다 — 다음 동기화가 전체 스냅숏", () => {
    patchContactsLocalState(U, { consented: true });
    const orig = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.endsWith("#n")) throw new Error("QuotaExceededError");
      return orig.call(this, k, v);
    });
    const st = writeContactsNumbers(U, { "+639170000001": "ref-1" });
    expect(st.numbersCount).toBeNull();
    expect(readContactsNumbers(U)).toBeNull();
  });
});
