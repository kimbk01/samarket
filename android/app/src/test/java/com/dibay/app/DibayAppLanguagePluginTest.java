package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** 언어 SSOT S8-1 — 저장 값은 "ko"·"en" 만, 그 외는 없음(= 기기 언어를 따름). */
public class DibayAppLanguagePluginTest {

  @Test
  public void normalizeKeepsOnlyKoAndEn() {
    assertEquals("ko", DibayAppLanguagePlugin.normalize("ko"));
    assertEquals("en", DibayAppLanguagePlugin.normalize(" EN "));
    assertNull(DibayAppLanguagePlugin.normalize(null));
    assertNull(DibayAppLanguagePlugin.normalize(""));
    assertNull(DibayAppLanguagePlugin.normalize("fil"));
    assertNull(DibayAppLanguagePlugin.normalize("ko-KR"));
  }

  @Test
  public void storedLanguageWithoutContextIsNull() {
    assertNull(DibayAppLanguagePlugin.storedLanguage(null));
  }
}
