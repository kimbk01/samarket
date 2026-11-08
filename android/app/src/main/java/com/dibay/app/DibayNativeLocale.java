package com.dibay.app;

import android.content.Context;
import android.content.res.Configuration;
import android.os.LocaleList;
import java.util.Locale;

/**
 * 언어 SSOT S8-3 — 통화 네이티브 문구의 언어.
 *
 * <p>앱에서 고른 언어(S8-1 {@link DibayAppLanguagePlugin#storedLanguage}) → 없으면 기기 언어(리소스 기본 = 영어,
 * values-ko = 한국어). 저장값이 기기 언어로 고른 리소스와 같으면 받은 Context 를 그대로 돌려준다(동작 변화 0).
 * 문구만 고른다 — 통화 분기·타이머·채널·Intent 와 무관.
 */
public final class DibayNativeLocale {
  private DibayNativeLocale() {}

  /** 저장된 앱 언어로 바꿔야 할 때만 그 언어("ko"·"en"), 아니면 null. */
  static String overrideLanguage(String stored, String deviceLanguage) {
    if (!"ko".equals(stored) && !"en".equals(stored)) return null;
    String resolvedByDevice = "ko".equals(deviceLanguage) ? "ko" : "en";
    return stored.equals(resolvedByDevice) ? null : stored;
  }

  /** 통화 문구를 읽을 Context — 앱 언어가 기기 언어와 다를 때만 그 언어로 만든 Context. */
  public static Context wrap(Context base) {
    if (base == null) return null;
    try {
      Configuration current = base.getResources().getConfiguration();
      Locale device = current.getLocales().isEmpty() ? Locale.getDefault() : current.getLocales().get(0);
      String target =
          overrideLanguage(DibayAppLanguagePlugin.storedLanguage(base), device.getLanguage());
      if (target == null) return base;
      Configuration config = new Configuration(current);
      config.setLocales(new LocaleList(Locale.forLanguageTag(target)));
      return base.createConfigurationContext(config);
    } catch (RuntimeException error) {
      return base;
    }
  }

  public static String string(Context context, int resId) {
    return wrap(context).getString(resId);
  }

  public static String string(Context context, int resId, Object... args) {
    return wrap(context).getString(resId, args);
  }
}
