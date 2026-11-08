import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { saveNotificationSchedule } from "./database";
import { getOccurrences } from "../utils/dates";

const ACTION_TYPE = "daymark-reminder";
const MAX_PENDING = 60;
const WEB_PUSH_DAYS_AHEAD = 45;

function isIOSHomeScreenApp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
  return ios && standalone;
}

function webPushAvailability() {
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)
    || !window.isSecureContext) return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !isIOSHomeScreenApp() ? "install-required" : "available";
}

function getPushServerUrl(settings) {
  if (!settings.pushServerUrl || !settings.pushVapidPublicKey) {
    throw new Error("Enter your HTTPS push-server URL and VAPID public key in Settings first.");
  }
  let url;
  try {
    url = new URL(settings.pushServerUrl);
  } catch {
    throw new Error("The push-server URL is not valid.");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("The push-server URL must use HTTPS (HTTP is allowed only for localhost).");
  }
  return url.href;
}

function decodeVapidKey(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("The VAPID public key is not valid base64url.");
  }
}

async function postPushServer(settings, body) {
  const url = getPushServerUrl(settings);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`The push server returned HTTP ${response.status}.`);
  }
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(`The push server returned an invalid response: ${error.message}`);
  }
  if (result?.ok !== true) {
    throw new Error("The push server did not confirm the requested operation.");
  }
  return result;
}

async function getWebPushSubscription(settings, create = false) {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  if (create && (webPushAvailability() !== "available" || Notification.permission !== "granted")) return null;
  const registration = await navigator.serviceWorker.ready;
  const pushManager = registration.pushManager;
  let subscription = await pushManager.getSubscription();
  if (!subscription && create) {
    subscription = await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(settings.pushVapidPublicKey),
    });
  }
  return subscription;
}

async function syncWebPush(reminders, settings) {
  if (!settings.notificationsEnabled) {
    const subscription = await getWebPushSubscription(settings);
    if (!subscription) return { scheduled: 0, disabled: true };
    let remoteError;
    if (settings.pushServerUrl && settings.pushVapidPublicKey) {
      try {
        await postPushServer(settings, { action: "unsubscribe", subscription });
      } catch (error) {
        remoteError = error;
      }
    }
    await subscription.unsubscribe();
    if (remoteError) throw new Error(`Web Push was disabled on this device, but the server could not be notified: ${remoteError.message}`);
    return { scheduled: 0, disabled: true };
  }
  if (webPushAvailability() !== "available") {
    return { scheduled: 0, unavailable: webPushAvailability() };
  }
  if (!settings.pushServerUrl || !settings.pushVapidPublicKey) {
    return { scheduled: 0, configured: false };
  }
  const subscription = await getWebPushSubscription(settings);
  if (!subscription) return { scheduled: 0, subscriptionRequired: true };

  const now = new Date();
  const occurrences = reminders.flatMap((reminder) => getOccurrences(reminder, now, WEB_PUSH_DAYS_AHEAD)
    .map(({ date }) => ({
      id: `${reminder.id}:${date.getTime()}`,
      reminderId: reminder.id,
      title: reminder.title,
      body: reminder.description || "A little nudge from Daymark.",
      scheduledAt: date.toISOString(),
    })))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const result = await postPushServer(settings, {
    action: "sync",
    subscription,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reminders: occurrences,
  });
  if (!Number.isInteger(result.scheduled) || result.scheduled < 0) {
    throw new Error("The push server did not confirm how many reminders it scheduled.");
  }
  return {
    scheduled: result.scheduled,
    requested: occurrences.length,
    incomplete: result.scheduled !== occurrences.length,
  };
}

export function isNativeNotificationPlatform() {
  return Capacitor.isNativePlatform();
}

export async function getNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    const result = await LocalNotifications.checkPermissions();
    return result.display;
  }
  const availability = webPushAvailability();
  return availability === "available" ? Notification.permission : availability;
}

export async function requestNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    const result = await LocalNotifications.requestPermissions();
    return result.display;
  }
  const availability = webPushAvailability();
  if (availability === "install-required") {
    throw new Error("On iPhone, add Daymark to your Home Screen and open it there before enabling Web Push.");
  }
  if (availability !== "available") {
    throw new Error("Web Push is unavailable in this browser or connection.");
  }
  return Notification.requestPermission();
}

export async function subscribeToWebPush(settings) {
  if (Capacitor.isNativePlatform()) return null;
  getPushServerUrl(settings);
  if (Notification.permission !== "granted") {
    throw new Error("Allow notifications in the browser before enabling Web Push.");
  }
  const subscription = await getWebPushSubscription(settings, true);
  if (!subscription) throw new Error("The browser could not create a Web Push subscription.");
  return subscription;
}

export async function registerNotificationActions() {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.registerActionTypes({
    types: [{
      id: ACTION_TYPE,
      actions: [
        { id: "snooze", title: "Snooze 10 min", foreground: false },
        { id: "done", title: "Complete", foreground: true },
      ],
    }],
  });
}

export async function syncNotifications(reminders, settings = {}) {
  if (!Capacitor.isNativePlatform()) return syncWebPush(reminders, settings);
  const existing = await LocalNotifications.getPending();
  if (existing.notifications.length) {
    await LocalNotifications.cancel({ notifications: existing.notifications });
  }
  await saveNotificationSchedule([]);
  const permission = await getNotificationPermission();
  if (permission !== "granted") return { scheduled: 0, permission };

  const now = new Date();
  const schedule = reminders.flatMap((reminder) => {
    const occurrences = getOccurrences(reminder, now, 45);
    if (!occurrences.length) return [];
    const repeatingInterval = {
      daily: "day",
      weekly: "week",
      monthly: "month",
    }[reminder.repeat];
    if (repeatingInterval && Number(reminder.interval || 1) === 1) {
      return [{ reminder, date: occurrences[0].date, every: repeatingInterval }];
    }
    if (reminder.repeat === "weekdays" && reminder.weekdays?.length) {
      const byWeekday = new Map();
      for (const occurrence of occurrences) {
        const weekday = occurrence.date.getDay();
        if (!byWeekday.has(weekday)) byWeekday.set(weekday, occurrence.date);
      }
      return [...byWeekday.values()].map((date) => ({ reminder, date, every: "week" }));
    }
    return occurrences.map(({ date }) => ({ reminder, date }));
  }).sort((a, b) => a.date - b.date).slice(0, MAX_PENDING);

  if (!schedule.length) return { scheduled: 0 };
  const scheduledNotifications = schedule.map(({ reminder, date, every }, index) => ({
      id: index + 1,
      title: reminder.title,
      body: reminder.description || "A little nudge from Daymark.",
      schedule: every ? { at: date, repeats: true, every } : { at: date },
      ...(settings.soundEnabled === false ? {} : { sound: "default" }),
      actionTypeId: ACTION_TYPE,
      extra: { reminderId: reminder.id },
    }));
  const result = await LocalNotifications.schedule({ notifications: scheduledNotifications });
  await saveNotificationSchedule(result.notifications.map(({ id }, index) => ({
    notificationId: id,
    reminderId: schedule[index].reminder.id,
    at: schedule[index].date.toISOString(),
  })));
  return { scheduled: result.notifications.length, capped: schedule.length === MAX_PENDING };
}

export async function snoozeReminder(reminder, minutes = 10, settings = {}) {
  if (!Capacitor.isNativePlatform()) {
    const subscription = await getWebPushSubscription(settings);
    if (!subscription || !settings.notificationsEnabled || Notification.permission !== "granted") return false;
    await postPushServer(settings, {
      action: "snooze",
      subscription,
      reminderId: reminder.id,
      minutes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return true;
  }
  const permission = await getNotificationPermission();
  if (permission !== "granted") return false;
  await LocalNotifications.schedule({
    notifications: [{
      id: Date.now() % 2147483647,
      title: reminder.title,
      body: reminder.description || "Snoozed reminder",
      schedule: { at: new Date(Date.now() + minutes * 60_000) },
      ...(settings.soundEnabled === false ? {} : { sound: "default" }),
      actionTypeId: ACTION_TYPE,
      extra: { reminderId: reminder.id },
    }],
  });
  return true;
}

export async function triggerHaptic(enabled) {
  if (!enabled) return;
  if (Capacitor.isNativePlatform()) {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
    return;
  }
  if (navigator.vibrate) navigator.vibrate(12);
}

export function addNotificationListener(event, callback) {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle;
  let active = true;
  LocalNotifications.addListener(event, callback).then((listener) => {
    if (active) handle = listener;
    else listener.remove();
  });
  return () => { active = false; handle?.remove(); };
}
