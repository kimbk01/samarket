package com.dibay.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 기기 인터넷 상태 — 설계 `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-5 (P3).
 *
 * <p>1차: OS 가 이미 검증해 둔 값 {@code NET_CAPABILITY_VALIDATED}(API 23+ · 「the system found actual connectivity to
 * the general Internet the last time it checked」). 요청 0건.
 * <p>2차(검증됨인데 DIBAY 문서를 못 받았을 때만): 확인 요청 1건 — 웹 P2 와 같은 주소·같은 8초 상한
 * (`https://www.gstatic.com/generate_204`, 쿠키·사용자 정보 없음). 결과로 「휴대폰 연결 불안정」과 「DIBAY 연결 문제」를 가른다.
 */
final class DibayConnectivity {
  private static final String TAG = "DibayConnectivity";
  static final String CHECK_URL = "https://www.gstatic.com/generate_204";
  /** 웹 `NAVIGATION_STALL_DEADLINE_MS` 와 같은 8초 */
  static final int CHECK_TIMEOUT_MS = 8000;

  enum Verdict {
    DEVICE_OFFLINE,
    DEVICE_UNSTABLE,
    DIBAY_UNREACHABLE,
  }

  interface Callback {
    void onVerdict(Verdict verdict);
  }

  private DibayConnectivity() {}

  /** true = OS 가 인터넷 검증됨 · false = 연결 없음/검증 안 됨 · null = 알 수 없음(권한·API) */
  static Boolean isInternetValidated(Context ctx) {
    try {
      ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm == null) return null;
      Network n = cm.getActiveNetwork();
      if (n == null) return Boolean.FALSE;
      NetworkCapabilities caps = cm.getNetworkCapabilities(n);
      if (caps == null) return Boolean.FALSE;
      return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
          && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    } catch (Exception e) {
      Log.w(TAG, "validated_check_failed " + e.getClass().getSimpleName());
      return null;
    }
  }

  /** 웹 브리지 값 — "1" 검증됨 · "0" 인터넷 없음 · "" 알 수 없음 */
  static String bridgeValue(Context ctx) {
    Boolean v = isInternetValidated(ctx);
    return v == null ? "" : (v ? "1" : "0");
  }

  /**
   * DIBAY 문서를 못 받은 뒤 판정. OS 가 「인터넷 없음」이면 요청 없이 DEVICE_OFFLINE.
   * 그 밖에는 확인 요청 1건(백그라운드) → 메인 스레드 콜백.
   */
  static void classifyAfterDibayFailure(Context ctx, Callback cb) {
    Handler main = new Handler(Looper.getMainLooper());
    Boolean validated = isInternetValidated(ctx);
    if (Boolean.FALSE.equals(validated)) {
      main.post(() -> cb.onVerdict(Verdict.DEVICE_OFFLINE));
      return;
    }
    new Thread(
            () -> {
              Verdict v;
              long started = System.currentTimeMillis();
              HttpURLConnection conn = null;
              try {
                conn = (HttpURLConnection) new URL(CHECK_URL).openConnection();
                conn.setConnectTimeout(CHECK_TIMEOUT_MS);
                conn.setReadTimeout(CHECK_TIMEOUT_MS);
                conn.setUseCaches(false);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestMethod("GET");
                int code = conn.getResponseCode();
                long took = System.currentTimeMillis() - started;
                v = took >= CHECK_TIMEOUT_MS ? Verdict.DEVICE_UNSTABLE : Verdict.DIBAY_UNREACHABLE;
                Log.i(TAG, "check code=" + code + " tookMs=" + took + " verdict=" + v);
              } catch (java.net.SocketTimeoutException e) {
                v = Verdict.DEVICE_UNSTABLE;
                Log.i(TAG, "check timeout verdict=" + v);
              } catch (Exception e) {
                v = Verdict.DEVICE_OFFLINE;
                Log.i(TAG, "check failed " + e.getClass().getSimpleName() + " verdict=" + v);
              } finally {
                if (conn != null) conn.disconnect();
              }
              final Verdict out = v;
              main.post(() -> cb.onVerdict(out));
            },
            "dibay-connectivity-check")
        .start();
  }
}
