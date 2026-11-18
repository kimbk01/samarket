package com.dibay.app;

import android.content.Context;
import android.os.Environment;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * 기기 저장공간 S2 (docs/audit/device-storage-legacy-design-2026-11-19.md §4 S2) — 레거시 앱 「저장공간 관리」 동일 형태.
 *
 * - getUsage: 사진·영상 등 캐시(앱 캐시 폴더 — WebView HTTP 캐시 포함) · 카메라 임시 사진(Pictures/JPEG_*) 바이트
 * - clearWebCache: WebView.clearCache(true) — 디스크·메모리 캐시만. 쿠키·로컬 저장소(로그인)는 지우지 않는다.
 * - clearCameraTemp: 업로드용으로 찍은 임시 사진 삭제(10분 안에 만든 파일은 업로드 중일 수 있어 남김)
 * - load(): 앱 시작 시 하루 지난 카메라 임시 사진 자동 정리(백그라운드)
 * 사용자가 사진첩(갤러리)에 저장한 사진은 앱 소유가 아니므로 건드리지 않는다(앱 전용 폴더만).
 */
@CapacitorPlugin(name = "DibayDeviceStorage")
public class DibayDeviceStoragePlugin extends Plugin {

  static final long CAMERA_TEMP_IN_USE_GUARD_MS = 10L * 60L * 1000L;
  static final long CAMERA_TEMP_AUTO_CLEAN_AGE_MS = 24L * 60L * 60L * 1000L;

  @Override
  public void load() {
    final Context ctx = getContext();
    new Thread(() -> {
      try {
        deleteCameraTemp(ctx, CAMERA_TEMP_AUTO_CLEAN_AGE_MS);
      } catch (RuntimeException ignored) {
        /* best-effort */
      }
    }, "dibay-storage-autoclean").start();
  }

  @PluginMethod
  public void getUsage(PluginCall call) {
    final Context ctx = getContext();
    new Thread(() -> call.resolve(usage(ctx)), "dibay-storage-usage").start();
  }

  @PluginMethod
  public void clearWebCache(PluginCall call) {
    final Context ctx = getContext();
    getActivity().runOnUiThread(() -> {
      try {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) wv.clearCache(true);
      } catch (RuntimeException ignored) {
        /* resolve with current usage below */
      }
      new Thread(() -> call.resolve(usage(ctx)), "dibay-storage-usage").start();
    });
  }

  @PluginMethod
  public void clearCameraTemp(PluginCall call) {
    final Context ctx = getContext();
    new Thread(() -> {
      deleteCameraTemp(ctx, CAMERA_TEMP_IN_USE_GUARD_MS);
      call.resolve(usage(ctx));
    }, "dibay-storage-camera").start();
  }

  static JSObject usage(Context ctx) {
    JSObject out = new JSObject();
    out.put("webCacheBytes", dirBytes(ctx.getCacheDir()));
    out.put("cameraTempBytes", cameraTempBytes(ctx));
    out.put("platform", "android");
    return out;
  }

  static File picturesDir(Context ctx) {
    try {
      return ctx.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
    } catch (RuntimeException e) {
      return null;
    }
  }

  static boolean isCameraTempFile(File f) {
    String n = f.getName();
    return f.isFile() && n.startsWith("JPEG_") && (n.endsWith(".jpg") || n.endsWith(".jpeg"));
  }

  static long cameraTempBytes(Context ctx) {
    File dir = picturesDir(ctx);
    if (dir == null) return 0L;
    File[] files = dir.listFiles();
    if (files == null) return 0L;
    long total = 0L;
    for (File f : files) if (isCameraTempFile(f)) total += f.length();
    return total;
  }

  static int deleteCameraTemp(Context ctx, long minAgeMs) {
    File dir = picturesDir(ctx);
    if (dir == null) return 0;
    File[] files = dir.listFiles();
    if (files == null) return 0;
    long now = System.currentTimeMillis();
    int deleted = 0;
    for (File f : files) {
      if (!isCameraTempFile(f)) continue;
      if (now - f.lastModified() < minAgeMs) continue;
      if (f.delete()) deleted++;
    }
    return deleted;
  }

  static long dirBytes(File dir) {
    if (dir == null || !dir.exists()) return 0L;
    if (dir.isFile()) return dir.length();
    long total = 0L;
    File[] children = dir.listFiles();
    if (children == null) return 0L;
    for (File c : children) total += c.isDirectory() ? dirBytes(c) : c.length();
    return total;
  }
}
