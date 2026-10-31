package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * C2·C6 목적지 계약 — TypeScript 와 같은 기준표(lib/notifications/contracts/notification-route-fixtures.json)로
 * Android 탭 해석기(FcmPayloadResolver.resolveRouteUrl, MainActivity 탭이 그대로 씀)를 검사한다.
 * 기준표는 lib/notifications/__tests__/notification-route-contract.test.ts 가 서버 빌더로 만든다.
 *
 * androidPending="N1" 행은 Android 네이티브 수정(N1, Owner 승인 대기) 전까지 계약과 다른 행이다 — 건너뛰되 개수를 고정한다.
 * docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §3 C2·C6, §4.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class)
public class NotificationRouteContractTest {
  private static final int EXPECTED_ANDROID_PENDING_ROWS = 3;

  private static JSONArray loadFixture() throws Exception {
    File dir = new File(System.getProperty("user.dir")).getAbsoluteFile();
    for (int i = 0; i < 6 && dir != null; i++) {
      File f = new File(dir, "lib/notifications/contracts/notification-route-fixtures.json");
      if (f.isFile()) {
        return new JSONArray(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
      }
      dir = dir.getParentFile();
    }
    throw new AssertionError("notification-route-fixtures.json not found from " + System.getProperty("user.dir"));
  }

  private static Map<String, String> toMap(JSONObject data) throws Exception {
    Map<String, String> out = new HashMap<>();
    Iterator<String> keys = data.keys();
    while (keys.hasNext()) {
      String k = keys.next();
      out.put(k, data.getString(k));
    }
    return out;
  }

  @Test
  public void androidResolver_matchesContractForEveryNonPendingRow() throws Exception {
    JSONArray rows = loadFixture();
    assertTrue("fixture must not be empty", rows.length() > 0);
    List<String> mismatches = new ArrayList<>();
    int pending = 0;
    for (int i = 0; i < rows.length(); i++) {
      JSONObject row = rows.getJSONObject(i);
      if ("N1".equals(row.optString("androidPending", ""))) {
        pending++;
        continue;
      }
      String expected = row.getString("expected");
      String actual = FcmPayloadResolver.resolveRouteUrl(toMap(row.getJSONObject("data")));
      if (!expected.equals(actual)) {
        mismatches.add(row.getString("id") + ": expected " + expected + " but was " + actual);
      }
    }
    assertEquals("contract mismatches: " + mismatches, 0, mismatches.size());
    assertEquals("androidPending(N1) rows changed — update after N1 approval", EXPECTED_ANDROID_PENDING_ROWS, pending);
  }
}
