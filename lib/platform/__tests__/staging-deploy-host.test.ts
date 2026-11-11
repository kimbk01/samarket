import { describe, expect, it } from "vitest";
import { isStagingDeployHost } from "@/lib/platform/staging-deploy-host";

describe("스테이징 표시 — 주소 판정", () => {
  it("운영 주소는 표시하지 않는다", () => {
    expect(isStagingDeployHost("samarket.vercel.app")).toBe(false);
    expect(isStagingDeployHost("SAMARKET.vercel.app")).toBe(false);
  });

  it("배포 고유 주소·브랜치 주소는 표시한다", () => {
    expect(isStagingDeployHost("samarket-qxtvycy6k-kimbk01s-projects.vercel.app")).toBe(true);
    expect(isStagingDeployHost("samarket-git-main-kimbk01s-projects.vercel.app")).toBe(true);
  });

  it("로컬·빈 값·다른 도메인은 표시하지 않는다", () => {
    expect(isStagingDeployHost("localhost")).toBe(false);
    expect(isStagingDeployHost("127.0.0.1")).toBe(false);
    expect(isStagingDeployHost("")).toBe(false);
    expect(isStagingDeployHost(null)).toBe(false);
    expect(isStagingDeployHost("example.com")).toBe(false);
  });
});
