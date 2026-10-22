import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIp } from "@/lib/security/remote-image-import-url";

describe("원격 이미지 SSRF — 사설·예약 주소 차단 (CM-P2-15)", () => {
  it.each([
    "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1",
    "0.0.0.0", "192.0.0.8", "198.18.0.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1",
    "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:127.0.0.1", "64:ff9b::a9fe:a9fe",
  ])("차단: %s", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "203.0.113.5", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("허용: %s", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });
});
