import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import {
  getPushStore,
  getReminderEvents,
  expiredSubscriptionKey,
  listSubscriptionKeys,
  readState,
  subscriptionHash,
  updateState,
} from "./push-core.mjs";

const require = createRequire(import.meta.url);
const webpush = require("web-push");
const CLAIM_DURATION_MS = 2 * 60_000;
const EVENT_EXPIRY_MS = 2 * 60 * 60_000;

function vapidConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function retainUnsentEvents(state, now) {
  return (state.events || []).filter((event) => event.status !== "sent"
    && Date.parse(event.scheduledAt) >= now.getTime() - EVENT_EXPIRY_MS);
}

async function refreshRecurringSchedule(store, key, now) {
  await updateState(store, key, (state) => {
    if (!state) return null;
    const refreshedAt = Date.parse(state.refreshedAt || "");
    if (Number.isFinite(refreshedAt) && now.getTime() - refreshedAt < 12 * 60 * 60_000) return state;
    const recurring = getReminderEvents(state.reminderRules || [], state.timeZone, Temporal.Instant.from(now.toISOString()));
    const retained = retainUnsentEvents(state, now);
    const events = new Map(retained.map((event) => [event.id, event]));
    for (const event of recurring) {
      if (!events.has(event.id)) events.set(event.id, { ...event, status: "pending", attempts: 0 });
    }
    return { ...state, events: [...events.values()], refreshedAt: now.toISOString() };
  });
}

async function claimDueEvent(store, key, now) {
  let claimed;
  await updateState(store, key, (state) => {
    claimed = undefined;
    if (!state) return null;
    const events = [...(state.events || [])];
    const index = events.findIndex((event) => {
      if (Date.parse(event.scheduledAt) > now.getTime()) return false;
      if (now.getTime() - Date.parse(event.scheduledAt) > EVENT_EXPIRY_MS) return false;
      if (Date.parse(event.nextAttemptAt || "") > now.getTime()) return false;
      if (event.status === "sent") return false;
      return event.status !== "processing" || Date.parse(event.leaseUntil || "") <= now.getTime();
    });
    if (index < 0) {
      const pruned = retainUnsentEvents(state, now);
      return pruned.length === events.length ? state : { ...state, events: pruned };
    }
    const event = events[index];
    claimed = { ...event, claimId: randomUUID() };
    events[index] = {
      ...event,
      status: "processing",
      claimId: claimed.claimId,
      leaseUntil: new Date(now.getTime() + CLAIM_DURATION_MS).toISOString(),
    };
    return { ...state, events };
  });
  return claimed;
}

async function finishClaim(store, key, claimed, result) {
  await updateState(store, key, (state) => {
    if (!state) return null;
    const events = (state.events || []).map((event) => {
      if (event.id !== claimed.id || event.claimId !== claimed.claimId) return event;
      if (result.sent) return { ...event, status: "sent", sentAt: new Date().toISOString(), claimId: undefined, leaseUntil: undefined };
      return {
        ...event,
        status: "pending",
        attempts: (event.attempts || 0) + 1,
        lastError: result.error,
        nextAttemptAt: new Date(Date.now() + Math.min(60, 5 * 2 ** (event.attempts || 0)) * 60_000).toISOString(),
        claimId: undefined,
        leaseUntil: undefined,
      };
    });
    return { ...state, events };
  });
}

export function isExpiredSubscriptionError(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

async function sendClaim(store, key, state, event, sendNotification) {
  try {
    await sendNotification(
      state.subscription,
      JSON.stringify({
        title: event.title,
        body: event.body,
        url: process.env.PUSH_APP_URL || "/",
        id: event.id,
        silent: !state.soundEnabled,
      }),
      { TTL: 3600, urgency: "high" },
    );
  } catch (error) {
    if (isExpiredSubscriptionError(error)) {
      await store.setJSON(expiredSubscriptionKey(subscriptionHash(state.subscription)), {
        expiredAt: new Date().toISOString(),
      });
      await store.delete(key);
      return "expired";
    }
    await finishClaim(store, key, event, { sent: false, error: String(error.message || "Push delivery failed").slice(0, 300) });
    console.error("Daymark Web Push delivery failed:", error.message);
    return "failed";
  }
  await finishClaim(store, key, event, { sent: true });
  return "sent";
}

export async function dispatchDueNotifications(now = new Date(), options = {}) {
  if (!vapidConfigured()) throw new Error("The Web Push sender is missing its VAPID environment variables.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const store = options.store || getPushStore();
  const sendNotification = options.sendNotification || webpush.sendNotification.bind(webpush);
  const keys = await listSubscriptionKeys(store);
  const summary = { subscriptions: keys.length, sent: 0, expired: 0, failed: 0 };
  for (const key of keys) {
    await refreshRecurringSchedule(store, key, now);
    const state = await readState(store, key);
    if (!state) continue;
    const claims = [];
    for (let count = 0; count < 20; count += 1) {
      const claimed = await claimDueEvent(store, key, now);
      if (!claimed) break;
      claims.push(claimed);
    }
    const results = await Promise.all(claims.map((claimed) => sendClaim(store, key, state.data, claimed, sendNotification)));
    summary.sent += results.filter((result) => result === "sent").length;
    summary.expired += results.filter((result) => result === "expired").length;
    summary.failed += results.filter((result) => result === "failed").length;
  }
  return summary;
}

export default async () => {
  try {
    const result = await dispatchDueNotifications();
    console.info("Daymark Web Push dispatch complete:", result);
  } catch (error) {
    console.error("Daymark Web Push dispatch failed:", error.message);
    throw error;
  }
};
