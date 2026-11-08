import { describe, expect, it } from "vitest";
import { splitMessageTextLinks } from "@/lib/community-messenger/text/message-link-segments";

const links = (s: string) =>
  splitMessageTextLinks(s)
    .filter((x) => x.kind === "link")
    .map((x) => (x.kind === "link" ? [x.text, x.href] : []));

describe("splitMessageTextLinks", () => {
  it("plain text stays one text segment", () => {
    expect(splitMessageTextLinks("안녕하세요")).toEqual([{ kind: "text", text: "안녕하세요" }]);
    expect(splitMessageTextLinks("")).toEqual([]);
  });

  it("whole message URL (운영 메시지 형태)", () => {
    expect(splitMessageTextLinks("https://play.google.com/apps/testing/com.dibay.app")).toEqual([
      {
        kind: "link",
        text: "https://play.google.com/apps/testing/com.dibay.app",
        href: "https://play.google.com/apps/testing/com.dibay.app",
      },
    ]);
  });

  it("URL after a line break keeps surrounding text (위치 공유 형태)", () => {
    const s = "📍 Location\nhttps://www.openstreetmap.org/?mlat=14.68&mlon=121.08#map=16/14.68/121.08";
    expect(splitMessageTextLinks(s)).toEqual([
      { kind: "text", text: "📍 Location\n" },
      {
        kind: "link",
        text: "https://www.openstreetmap.org/?mlat=14.68&mlon=121.08#map=16/14.68/121.08",
        href: "https://www.openstreetmap.org/?mlat=14.68&mlon=121.08#map=16/14.68/121.08",
      },
    ]);
  });

  it("text is preserved exactly when joined back", () => {
    const s = "보세요 https://a.com/x, 그리고 www.b.com. 끝 (https://c.com/y) [http://d.com]";
    expect(splitMessageTextLinks(s).map((x) => x.text).join("")).toBe(s);
  });

  it("www. gets https href, display text unchanged", () => {
    expect(links("go www.dibay.app/help now")).toEqual([["www.dibay.app/help", "https://www.dibay.app/help"]]);
  });

  it("trailing punctuation and unmatched closing brackets are excluded", () => {
    expect(links("https://a.com/x.")).toEqual([["https://a.com/x", "https://a.com/x"]]);
    expect(links("링크: https://a.com/x?, 다음")).toEqual([["https://a.com/x", "https://a.com/x"]]);
    expect(links("(https://a.com/x)")).toEqual([["https://a.com/x", "https://a.com/x"]]);
    expect(links("[http://d.com]")).toEqual([["http://d.com", "http://d.com"]]);
    expect(links("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      ["https://en.wikipedia.org/wiki/Foo_(bar)", "https://en.wikipedia.org/wiki/Foo_(bar)"],
    ]);
  });

  it("Korean directly after URL is not part of the link", () => {
    expect(links("https://a.com/path에서 확인")).toEqual([["https://a.com/path", "https://a.com/path"]]);
  });

  it("multiple links", () => {
    expect(links("a https://x.com b http://y.com/z c")).toEqual([
      ["https://x.com", "https://x.com"],
      ["http://y.com/z", "http://y.com/z"],
    ]);
  });

  it("non-http schemes and mid-word matches are not links", () => {
    expect(links("javascript:alert(1)")).toEqual([]);
    expect(links("ftp://a.com")).toEqual([]);
    expect(links("awww.example.com")).toEqual([]);
    expect(links("xhttps://a.com")).toEqual([]);
    expect(links("https://")).toEqual([]);
    expect(links("www.")).toEqual([]);
  });

  it("uppercase scheme accepted", () => {
    expect(links("HTTPS://A.COM")).toEqual([["HTTPS://A.COM", "HTTPS://A.COM"]]);
  });
});
