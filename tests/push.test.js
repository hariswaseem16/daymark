import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Temporal } from "@js-temporal/polyfill";
import {
  buildSubscriptionState,
  expiredSubscriptionKey,
  getReminderEvents,
  subscriptionHash,
  validateSubscription,
} from "../netlify/functions/push-core.mjs";
import { dispatchDueNotifications, isExpiredSubscriptionError } from "../netlify/functions/dispatch-push.mjs";
import { handler as pushApiHandler } from "../netlify/functions/push-api.mjs";
import { createSnoozeEntry } from "../src/utils/snooze.js";

const require = createRequire(import.meta.url);
const webpush = require("web-push");
const subscription = {
  endpoint: "https://push.example.test/subscription",
  keys: { p256dh: "public-key", auth: "auth-secret" },
};

function makeReminder(overrides = {}) {
  return {
    id: "reminder-1",
    title: "Take medicine",
    description: "With water",
    date: "2026-01-01",
    time: "09:00",
    times: ["09:00"],
    repeat: "never",
    interval: 1,
    weekdays: [],
    completed: false,
    ...overrides,
  };
}

test("Asia/Karachi local times convert to the correct UTC instant across midnight", () => {
  const reminder = makeReminder({ date: "2026-01-01", time: "01:00", times: ["01:00"] });
  const events = getReminderEvents(
    [reminder],
    "Asia/Karachi",
    Temporal.Instant.from("2025-12-31T19:30:00Z"),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].scheduledAt, "2025-12-31T20:00:00Z");
});

test("recurring reminders retain local wall time across a DST transition", () => {
  const reminder = makeReminder({
    date: "2026-03-07",
    time: "09:15",
    times: ["09:15"],
    repeat: "daily",
  });
  const events = getReminderEvents(
    [reminder],
    "America/New_York",
    Temporal.Instant.from("2026-03-07T12:00:00Z"),
    3,
  );
  assert.deepEqual(events.map((event) => event.scheduledAt), [
    "2026-03-07T14:15:00Z",
    "2026-03-08T13:15:00Z",
    "2026-03-09T13:15:00Z",
    "2026-03-10T13:15:00Z",
  ]);
});

test("server schedule stores recurring occurrences and snoozes without changing the source reminder", () => {
  const reminder = makeReminder({ repeat: "daily" });
  const original = structuredClone(reminder);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const snooze = {
    id: "snooze-1",
    reminderId: reminder.id,
    title: reminder.title,
    body: "Snoozed reminder",
    scheduledAt: "2026-01-01T00:10:00.000Z",
    kind: "snooze",
  };
  const occurrences = getReminderEvents([reminder], "Asia/Karachi", Temporal.Instant.from(now.toISOString()))
    .map((event) => ({ ...event, scheduledAt: new Date(event.scheduledAt).toISOString() }));
  const state = buildSubscriptionState({
    subscription,
    timeZone: "Asia/Karachi",
    reminderRules: [reminder],
    occurrences,
    snoozes: [snooze],
  }, null, now);
  assert.equal(state.timeZone, "Asia/Karachi");
  assert.equal(state.events.find((event) => event.id === snooze.id).kind, "snooze");
  assert.ok(state.events.some((event) => event.kind === "reminder" && event.reminderId === reminder.id));
  assert.deepEqual(reminder, original);
});

test("snooze creates a separate UTC delivery without mutating reminder recurrence", () => {
  const reminder = makeReminder({ repeat: "weekly", interval: 2 });
  const original = structuredClone(reminder);
  const now = new Date("2026-01-01T19:55:00.000Z");
  const snooze = createSnoozeEntry(reminder, 10, now);
  assert.equal(snooze.scheduledAt, "2026-01-01T20:05:00.000Z");
  assert.equal(snooze.reminderId, reminder.id);
  assert.deepEqual(reminder, original);
});

test("missing and expired push subscriptions are handled explicitly", () => {
  assert.equal(validateSubscription(undefined), false);
  assert.equal(isExpiredSubscriptionError({ statusCode: 404 }), true);
  assert.equal(isExpiredSubscriptionError({ statusCode: 410 }), true);
  assert.equal(isExpiredSubscriptionError({ statusCode: 503 }), false);
});

test("push API protects config and schedule operations with the bearer token", async () => {
  const previous = {
    allowedOrigin: process.env.PUSH_ALLOWED_ORIGIN,
    token: process.env.PUSH_API_TOKEN,
    vapidPublic: process.env.VAPID_PUBLIC_KEY,
    vapidPrivate: process.env.VAPID_PRIVATE_KEY,
    vapidSubject: process.env.VAPID_SUBJECT,
  };
  process.env.PUSH_ALLOWED_ORIGIN = "https://daymark.example";
  process.env.PUSH_API_TOKEN = "private-test-token";
  process.env.VAPID_PUBLIC_KEY = "public-test-key";
  process.env.VAPID_PRIVATE_KEY = "private-test-key";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  try {
    const unauthorized = await pushApiHandler(new Request("https://daymark.example/.netlify/functions/push-api", {
      method: "POST",
      headers: {
        Origin: "https://daymark.example",
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "sync", subscription }),
    }));
    assert.equal(unauthorized.status, 401);

    const config = await pushApiHandler(new Request("https://daymark.example/.netlify/functions/push-api", {
      headers: { Origin: "https://daymark.example", Authorization: "Bearer private-test-token" },
    }));
    assert.equal(config.status, 200);
    const configBody = await config.json();
    assert.equal(configBody.vapidPublicKey, "public-test-key");
    assert.equal(JSON.stringify(configBody).includes("private-test-key"), false);

    const wrongOrigin = await pushApiHandler(new Request("https://daymark.example/.netlify/functions/push-api", {
      headers: { Origin: "https://attacker.example", Authorization: "Bearer private-test-token" },
    }));
    assert.equal(wrongOrigin.status, 403);
  } finally {
    if (previous.allowedOrigin === undefined) delete process.env.PUSH_ALLOWED_ORIGIN;
    else process.env.PUSH_ALLOWED_ORIGIN = previous.allowedOrigin;
    if (previous.token === undefined) delete process.env.PUSH_API_TOKEN;
    else process.env.PUSH_API_TOKEN = previous.token;
    if (previous.vapidPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previous.vapidPublic;
    if (previous.vapidPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = previous.vapidPrivate;
    if (previous.vapidSubject === undefined) delete process.env.VAPID_SUBJECT;
    else process.env.VAPID_SUBJECT = previous.vapidSubject;
  }
});

test("dispatcher removes expired subscriptions instead of retrying them", async () => {
  const previous = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  };
  const vapidKeys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  const now = new Date("2026-01-01T00:10:00.000Z");
  const key = "subscriptions/test";
  const state = {
    subscription,
    reminderRules: [],
    timeZone: "Asia/Karachi",
    events: [{
      id: "due-1",
      reminderId: "reminder-1",
      title: "Test",
      body: "Due",
      scheduledAt: "2026-01-01T00:05:00.000Z",
      status: "pending",
      attempts: 0,
    }],
    refreshedAt: now.toISOString(),
  };
  const values = new Map([[key, state]]);
  const store = {
    async *list() { yield { blobs: [{ key }] }; },
    async getWithMetadata(blobKey) {
      return values.has(blobKey) ? { data: structuredClone(values.get(blobKey)), etag: "v1" } : null;
    },
    async setJSON(blobKey, value) {
      values.set(blobKey, structuredClone(value));
      return { modified: true };
    },
    async delete(blobKey) { values.delete(blobKey); },
  };
  try {
    const summary = await dispatchDueNotifications(now, {
      store,
      sendNotification: async () => { throw Object.assign(new Error("subscription expired"), { statusCode: 410 }); },
    });
    assert.equal(summary.expired, 1);
    assert.equal(values.has(key), false);
    assert.equal(values.has(expiredSubscriptionKey(subscriptionHash(subscription))), true);
  } finally {
    if (previous.publicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previous.publicKey;
    if (previous.privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = previous.privateKey;
    if (previous.subject === undefined) delete process.env.VAPID_SUBJECT;
    else process.env.VAPID_SUBJECT = previous.subject;
  }
});
