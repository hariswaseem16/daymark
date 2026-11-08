import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";

export async function registerPwaServiceWorker() {
  if (Capacitor.isNativePlatform()) return;
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers, so offline app caching is unavailable.");
  }
  return registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error("Daymark service worker registration failed.", error);
    },
  });
}
