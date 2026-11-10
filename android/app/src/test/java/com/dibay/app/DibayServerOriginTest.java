package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** 네이티브 API 주소 = server.url 의 scheme://host[:port] (2026-11-11). */
public class DibayServerOriginTest {
  @Test
  public void productionUrlUnchanged() {
    assertEquals("https://samarket.vercel.app", DibayServerOrigin.originOf("https://samarket.vercel.app"));
    assertEquals("https://samarket.vercel.app", DibayServerOrigin.originOf("https://samarket.vercel.app/"));
  }

  @Test
  public void dropsBypassQueryAndPath() {
    assertEquals(
        "https://samarket-env-test-kimbk01s-projects.vercel.app",
        DibayServerOrigin.originOf(
            "https://samarket-env-test-kimbk01s-projects.vercel.app/?x-vercel-protection-bypass=abc&x-vercel-set-bypass-cookie=samesitenone"));
  }

  @Test
  public void keepsPort() {
    assertEquals("http://192.168.0.10:3000", DibayServerOrigin.originOf("http://192.168.0.10:3000/"));
  }

  @Test
  public void emptyIsNull() {
    assertNull(DibayServerOrigin.originOf("  "));
    assertNull(DibayServerOrigin.originOf(null));
  }
}
