import { describe, expect, it } from "vitest";
import {
  buildContactsNumberMap,
  chunkContactsForSnapshot,
  contactsClientRef,
  diffContactsNumberMaps,
} from "@/lib/community-messenger/contacts/contacts-diff";

describe("기기 안 연락처 비교 (SSOT v5 §4 S4·S7 — 매번 찾지 않음)", () => {
  const contacts = [
    { id: "1", name: "이영희", numbers: ["0917 123 4567", "+63 917 123 4567"] },
    { id: "2", name: "Kim", numbers: ["010-1234-5678", "02-123-4567"] },
    { id: "3", name: "Foreign", numbers: ["+1 415 555 0100"] },
  ];
  it("번호표: 같은 번호 1개, 형식 불가·다른 나라 제외, 이름은 기기 안 표에만", () => {
    const ph = buildContactsNumberMap(contacts, "PH");
    expect(Object.keys(ph.numbers)).toEqual(["+639171234567"]);
    const kr = buildContactsNumberMap(contacts, "KR");
    expect(Object.keys(kr.numbers).sort()).toEqual(["+639171234567", "+821012345678"].sort());
    expect(kr.names[contactsClientRef("1")]).toBe("이영희");
    expect(contactsClientRef("1")).not.toContain("1".repeat(5));
    expect(contactsClientRef("1")).toMatch(/^c[0-9a-f]{16}$/);
  });
  it("바뀐 것만: 추가·삭제·연락처 이동", () => {
    const prev = { "+639171234567": "ca", "+821012345678": "cb" };
    const next = { "+639171234567": "cz", "+639990000000": "cc" };
    expect(diffContactsNumberMaps(prev, next)).toEqual({
      add: [
        { e164: "+639171234567", ref: "cz" },
        { e164: "+639990000000", ref: "cc" },
      ],
      remove: ["+821012345678"],
    });
    expect(diffContactsNumberMaps(next, next)).toEqual({ add: [], remove: [] });
  });
  it("스냅숏 조각 1,000개 · 빈 연락처는 빈 조각 1개(서버가 이전 세대 정리)", () => {
    const many = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`+63917${String(i).padStart(7, "0")}`, `c${i}`]));
    expect(chunkContactsForSnapshot(many).map((c) => c.length)).toEqual([1000, 1000, 500]);
    expect(chunkContactsForSnapshot({})).toEqual([[]]);
  });
});
