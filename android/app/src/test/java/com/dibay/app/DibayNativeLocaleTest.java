package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** 언어 SSOT S8-3 — 통화 문구 언어: 앱에서 고른 언어 → 없으면 기기 언어(ko → ko, 그 외 → en). */
public class DibayNativeLocaleTest {
  @Test
  public void noStoredLanguageFollowsDevice() {
    assertNull(DibayNativeLocale.overrideLanguage(null, "ko"));
    assertNull(DibayNativeLocale.overrideLanguage(null, "en"));
    assertNull(DibayNativeLocale.overrideLanguage(null, "fil"));
  }

  @Test
  public void storedSameAsDeviceResultKeepsContext() {
    assertNull(DibayNativeLocale.overrideLanguage("ko", "ko"));
    assertNull(DibayNativeLocale.overrideLanguage("en", "en"));
    // 한국어·영어가 아닌 기기 언어는 리소스가 이미 영어
    assertNull(DibayNativeLocale.overrideLanguage("en", "fil"));
  }

  @Test
  public void storedDifferentFromDeviceOverrides() {
    assertEquals("ko", DibayNativeLocale.overrideLanguage("ko", "en"));
    assertEquals("ko", DibayNativeLocale.overrideLanguage("ko", "fil"));
    assertEquals("en", DibayNativeLocale.overrideLanguage("en", "ko"));
  }

  @Test
  public void unknownStoredValueIgnored() {
    assertNull(DibayNativeLocale.overrideLanguage("ja", "ko"));
    assertNull(DibayNativeLocale.overrideLanguage("", "en"));
  }
}
