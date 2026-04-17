const { test, chromium } = require("playwright/test");
const { runRealUsageCheck } = require("./community-messenger-real-usage-check.cjs");

test.setTimeout(20 * 60 * 1000);

test("community messenger real usage", async () => {
  const output = await runRealUsageCheck({ chromium });
  console.log(`SAMARKET_REAL_USAGE_RESULT=${JSON.stringify(output)}`);
});
