package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 언어 SSOT S8-1 — 앱 언어(웹 결정)를 네이티브가 읽을 수 있게 저장만 한다.
 *
 * <p>값: "ko" · "en" = 사용자가 고른(또는 계정의) 앱 언어, 없음 = 기기 언어를 따름.
 * 앱이 꺼진 상태의 네이티브 문구(S8-3·S8-4 예정)가 이 저장값을 읽는다. 이 단계는 저장만 하고 어떤 화면·통화 동작도 바꾸지 않는다.
 * 웹 계약: {@code docs/i18n-ssot.md} §2, 계획: {@code docs/audit/i18n-s8-native-plan-2026-11-08.md}.
 */
@CapacitorPlugin(name = "DibayAppLanguage")
public class DibayAppLanguagePlugin extends Plugin {

  static final String PREFS = "dibay_app_language";
  static final String KEY_LANGUAGE = "language";

  @PluginMethod
  public void set(PluginCall call) {
    String language = normalize(call.getString("language"));
    SharedPreferences.Editor editor = prefs(getContext()).edit();
    if (language == null) {
      editor.remove(KEY_LANGUAGE);
    } else {
      editor.putString(KEY_LANGUAGE, language);
    }
    editor.apply();
    JSObject result = new JSObject();
    result.put("language", language);
    call.resolve(result);
  }

  @PluginMethod
  public void get(PluginCall call) {
    JSObject result = new JSObject();
    result.put("language", storedLanguage(getContext()));
    call.resolve(result);
  }

  /** 저장된 앱 언어("ko"·"en"), 없으면 null(= 기기 언어를 따름). */
  public static String storedLanguage(Context context) {
    if (context == null) return null;
    return normalize(prefs(context).getString(KEY_LANGUAGE, null));
  }

  static String normalize(String raw) {
    if (raw == null) return null;
    String v = raw.trim().toLowerCase(java.util.Locale.ROOT);
    if ("ko".equals(v) || "en".equals(v)) return v;
    return null;
  }

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
