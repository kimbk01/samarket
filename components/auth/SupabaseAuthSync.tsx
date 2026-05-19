"use client";



import { useEffect } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase/client";

import {

  setSupabaseProfileCache,

  userToProfile,

} from "@/lib/auth/supabase-profile-cache";

import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";

import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";

import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";

import { resetMessengerNotificationSurfacesAfterSignOut } from "@/lib/community-messenger/notifications/messenger-notification-surfaces-reset";

import { invalidateAppBootAll } from "@/components/app/AppBootProvider";

import { ensureAppBoot } from "@/lib/app-boot/run-app-boot";

import { peekAppBootProfile } from "@/lib/app-boot/app-boot-store";

import { APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";

import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";



function clearSignedOutClientCaches(): void {

  invalidateAppBootAll();

  setSupabaseProfileCache(null);

  clearBootstrapCache();

  resetMessengerNotificationSurfacesAfterSignOut();

  dispatchTestAuthChanged();

}



function applySupabaseProfileCacheFromBoot(sb: SupabaseClient): void {

  const bootProfile = peekAppBootProfile();

  void sb.auth.getUser().then(({ data: { user }, error }) => {

    if (!user) {

      if (shouldClearProfileCacheOnGetUserFailure(user, error)) {

        clearSignedOutClientCaches();

      }

      return;

    }

    let nextProfile = userToProfile(user);

    if (bootProfile) {

      const p = profileRowToClientProfile(bootProfile);

      nextProfile = {

        ...nextProfile,

        ...p,

        avatar_url: p.avatar_url ?? nextProfile?.avatar_url ?? null,

        temperature: p.temperature ?? nextProfile?.temperature ?? 50,

        auth_provider: p.auth_provider ?? nextProfile?.auth_provider ?? null,

      };

    }

    setSupabaseProfileCache(nextProfile);

    dispatchTestAuthChanged();

  });

}



/**

 * Supabase 브라우저 세션 ↔ 프로필 캐시 — **GET /api/me/profile 은 AppBootProvider 1회만**.

 */

export function SupabaseAuthSync() {

  useEffect(() => {

    const sb = getSupabaseClient();

    if (!sb) return;



    const onBootReady = () => applySupabaseProfileCacheFromBoot(sb);

    window.addEventListener(APP_BOOT_READY_EVENT, onBootReady);

    void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));



    const {

      data: { subscription },

    } = sb.auth.onAuthStateChange((event, session) => {

      if (event === "SIGNED_OUT") {

        clearSignedOutClientCaches();

        return;

      }

      if (event === "INITIAL_SESSION") {

        if (!session) {

          clearSignedOutClientCaches();

        } else {

          void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));

        }

        return;

      }

      if (!session) {

        return;

      }

      if (event === "SIGNED_IN") {

        invalidateAppBootAll();

        void ensureAppBoot().then(() => applySupabaseProfileCacheFromBoot(sb));

      } else {

        applySupabaseProfileCacheFromBoot(sb);

      }

    });



    return () => {

      subscription.unsubscribe();

      window.removeEventListener(APP_BOOT_READY_EVENT, onBootReady);

    };

  }, []);



  return null;

}


