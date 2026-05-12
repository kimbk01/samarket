import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampStorePrepMinutes,
  parseCommerceExtrasFromHoursJson,
  parsePrepMinutesLegacyFromEstPrepLabel,
} from "../store-commerce-extras";

test("parsePrepMinutesLegacyFromEstPrepLabel range uses midpoint", () => {
  assert.equal(parsePrepMinutesLegacyFromEstPrepLabel("20~40분"), 30);
});

test("parsePrepMinutesLegacyFromEstPrepLabel single minute", () => {
  assert.equal(parsePrepMinutesLegacyFromEstPrepLabel("25분"), 25);
});

test("clampStorePrepMinutes", () => {
  assert.equal(clampStorePrepMinutes(0), 1);
  assert.equal(clampStorePrepMinutes(500), 180);
});

test("parseCommerceExtrasFromHoursJson reads prep_time_minutes", () => {
  const x = parseCommerceExtrasFromHoursJson({ prep_time_minutes: 42, est_prep_label: "99분" });
  assert.equal(x.prepMinutes, 42);
  assert.equal(x.estPrepLabel, "42분");
});
