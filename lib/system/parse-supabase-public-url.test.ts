import { describe, expect, it } from "vitest";
import { parseSupabasePublicUrl } from "./parse-supabase-public-url";

describe("parseSupabasePublicUrl", () => {
  it("parses standard supabase.co host", () => {
    expect(parseSupabasePublicUrl("https://AbC123xy.supabase.co")).toEqual({
      host: "abc123xy.supabase.co",
      projectRef: "abc123xy",
    });
  });

  it("returns host as projectRef for custom hostname", () => {
    expect(parseSupabasePublicUrl("https://db.example.com")).toEqual({
      host: "db.example.com",
      projectRef: "db.example.com",
    });
  });
});
