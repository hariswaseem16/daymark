import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { Temporal } from "@js-temporal/polyfill";

const STORE_NAME = "daymark-web-push";
const SUBSCRIPTION_PREFIX = "subscriptions/";
const SCHEDULE_DAYS = 45;
export const EVENT_EXPIRY_MS = 2 * 60 * 60_000;
const MAX_REMINDERS = 500;
const MAX_EVENTS = 5_000;

export function getPushStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export function isValidTimeZone(value) {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    Temporal.Now.instant().toZonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
}

export function validateSubscription(subscription) {
  return Boolean(subscription
    && typeof subscription.endpoint === "string"
    && subscription.endpoint.length <= 2048
    && subscription.endpoint.startsWith("https://")
    && typeof subscription.keys?.p256dh === "string"
    && subscription.keys.p256dh.length <= 256
    && typeof subscription.keys?.auth === "string"
    && subscription.keys.auth.length <= 256);
}

function validDate(value) {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

function validTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateReminder(reminder) {
  return Boolean(reminder
    && typeof reminder.id === "string" && reminder.id.length > 0 && reminder.id.length <= 200
    && typeof reminder.title === "string" && reminder.title.trim().length > 0 && reminder.title.length <= 200
    && typeof reminder.description === "string" && reminder.description.length <= 2000
    && validDate(reminder.date)
    && validTime(reminder.time)
    && Array.isArray(reminder.times) && reminder.times.length > 0 && reminder.times.length <= 10
    && reminder.times.every(validTime)
    && ["never", "daily", "weekly", "monthly", "weekdays", "custom"].includes(reminder.repeat)
    && Number.isInteger(Number(reminder.interval)) && Number(reminder.interval) >= 1 && Number(reminder.interval) <= 365
    && Array.isArray(reminder.weekdays) && reminder.weekdays.length <= 7
    && reminder.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && typeof reminder.completed === "boolean");
}

function weekdayFor(date) {
  return date.dayOfWeek % 7;
}

function reminderMatchesDate(reminder, date, startDate) {
  const daysSinceStart = startDate.until(date, { largestUnit: "day" }).days;
  if (daysSinceStart < 0) return false;
  const interval = Math.max(1, Number(reminder.interval) || 1);
  const weeksSinceStart = Math.floor(daysSinceStart / 7);
  const monthsSinceStart = (date.year - startDate.year) * 12 + date.month - startDate.month;
  const weekdayMatches = reminder.weekdays.includes(weekdayFor(date));
  switch (reminder.repeat || "never") {
    case "never": return daysSinceStart === 0;
    case "daily": return daysSinceStart % interval === 0;
    case "weekly": return daysSinceStart % (7 * interval) === 0;
    case "monthly": return monthsSinceStart % interval === 0 && date.day === startDate.day;
    case "weekdays": return weekdayMatches;
    case "custom":
      return reminder.weekdays.length
        ? weekdayMatches && weeksSinceStart % interval === 0
        : daysSinceStart % interval === 0;
    default: return false;
  }
}

export function getReminderEvents(reminders, timeZone, from = Temporal.Now.instant(), daysAhead = SCHEDULE_DAYS) {
  if (!isValidTimeZone(timeZone)) throw new Error("A valid IANA timezone is required to schedule reminders.");
  const start = from.toZonedDateTimeISO(timeZone);
  const firstDay = start.toPlainDate();
  const lastDay = firstDay.add({ days: daysAhead });
  const endLocal = lastDay.add({ days: 1 }).toPlainDateTime({ hour: 0 });
  const endInstant = endLocal.toZonedDateTime(timeZone, { disambiguation: "compatible" }).toInstant();
  const events = [];

  for (const reminder of reminders) {
    if (reminder.completed) continue;
    const reminderStart = Temporal.PlainDate.from(reminder.date);
    const first = Temporal.PlainDate.compare(firstDay, reminderStart) > 0 ? firstDay : reminderStart;
    for (let date = first; Temporal.PlainDate.compare(date, lastDay) <= 0; date = date.add({ days: 1 })) {
      if (!reminderMatchesDate(reminder, date, reminderStart)) continue;
      for (const time of reminder.times) {
        const [hour, minute] = time.split(":").map(Number);
        const localDateTime = date.toPlainDateTime({ hour, minute });
        const instant = localDateTime.toZonedDateTime(timeZone, { disambiguation: "compatible" }).toInstant();
        if (Temporal.Instant.compare(instant, from) <= 0 || Temporal.Instant.compare(instant, endInstant) > 0) continue;
        const id = `${reminder.id}:${instant.epochMilliseconds}`;
        events.push({
          id,
          reminderId: reminder.id,
          title: reminder.title,
          body: reminder.description || "A little nudge from Daymark.",
          scheduledAt: instant.toString(),
          kind: "reminder",
        });
      }
    }
  }
  return events.sort((left, right) => Temporal.Instant.compare(left.scheduledAt, right.scheduledAt));
}

function validateEvent(event, validReminderIds) {
  if (!event || typeof event.id !== "string" || event.id.length > 300
    || !validReminderIds.has(event.reminderId)
    || typeof event.title !== "string" || event.title.trim().length === 0 || event.title.length > 200
    || typeof event.body !== "string" || event.body.length > 2000
    || typeof event.scheduledAt !== "string") return false;
  try {
    return Number.isFinite(Date.parse(event.scheduledAt))
      && new Date(event.scheduledAt).toISOString() === event.scheduledAt;
  } catch {
    return false;
  }
}

function normalizeSnoozes(snoozes, validReminderIds) {
  if (!Array.isArray(snoozes) || snoozes.length > 1000) {
    throw new Error("The snoozed reminder list is invalid.");
  }
  return snoozes.map((event) => {
    if (!validateEvent(event, validReminderIds) || event.kind !== "snooze") {
      throw new Error("A snoozed reminder could not be validated.");
    }
    return {
      id: event.id,
      reminderId: event.reminderId,
      title: event.title,
      body: event.body,
      scheduledAt: event.scheduledAt,
      kind: "snooze",
    };
  });
}

export function buildSubscriptionState(input, previous = null, now = new Date()) {
  const { subscription, timeZone, reminderRules, occurrences, snoozes = [], soundEnabled = true } = input;
  if (!validateSubscription(subscription)) throw new Error("The Web Push subscription is invalid.");
  if (!isValidTimeZone(timeZone)) throw new Error("A valid device timezone is required.");
  if (!Array.isArray(reminderRules) || reminderRules.length > MAX_REMINDERS
    || !reminderRules.every(validateReminder)) {
    throw new Error("The reminder schedule is invalid.");
  }
  if (!Array.isArray(occurrences) || occurrences.length > MAX_EVENTS) {
    throw new Error("The reminder occurrence list is invalid.");
  }
  const activeReminders = reminderRules.filter((reminder) => !reminder.completed);
  const validIds = new Set(activeReminders.map((reminder) => reminder.id));
  if (!occurrences.every((event) => validateEvent(event, validIds) && event.kind !== "snooze")) {
    throw new Error("A scheduled reminder occurrence could not be validated.");
  }
  const suppliedEvents = occurrences.map((event) => ({
    id: event.id,
    reminderId: event.reminderId,
    title: event.title,
    body: event.body,
    scheduledAt: event.scheduledAt,
    kind: "reminder",
  }));
  const snoozedEvents = normalizeSnoozes(snoozes, validIds);
  const recurringEvents = getReminderEvents(activeReminders, timeZone, Temporal.Instant.from(now.toISOString()));
  const recurringById = new Map(recurringEvents.map((event) => [event.id, event]));
  const matchingSuppliedEvents = suppliedEvents.filter((event) => {
    const serverOccurrence = recurringById.get(event.id);
    return serverOccurrence && Date.parse(serverOccurrence.scheduledAt) === Date.parse(event.scheduledAt);
  });
  const combined = new Map([...recurringEvents, ...matchingSuppliedEvents, ...snoozedEvents]
    .map((event) => [event.id, event]));
  const futureEvents = [...combined.values()]
    .filter((event) => Date.parse(event.scheduledAt) > now.getTime())
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
  const previousEvents = new Map((previous?.events || []).map((event) => [event.id, event]));
  const dueEvents = (previous?.events || []).filter((event) => {
    const scheduledAt = Date.parse(event.scheduledAt);
    return event.status !== "sent"
      && validIds.has(event.reminderId)
      && scheduledAt <= now.getTime()
      && scheduledAt >= now.getTime() - EVENT_EXPIRY_MS;
  });
  const events = [...futureEvents, ...dueEvents].map((event) => {
    const previousEvent = previousEvents.get(event.id);
    const processing = previousEvent?.status === "processing"
      && Date.parse(previousEvent.leaseUntil || "") > now.getTime();
    return {
      ...event,
      status: previousEvent?.status === "sent" ? "sent" : processing ? "processing" : "pending",
      attempts: previousEvent?.attempts || 0,
      claimId: processing ? previousEvent.claimId : undefined,
      leaseUntil: processing ? previousEvent.leaseUntil : undefined,
    };
  });
  return {
    subscription,
    timeZone,
    reminderRules: activeReminders,
    soundEnabled: Boolean(soundEnabled),
    events,
    updatedAt: now.toISOString(),
    refreshedAt: now.toISOString(),
  };
}

export function subscriptionKey(endpointHash) {
  return `${SUBSCRIPTION_PREFIX}${endpointHash}`;
}

export function subscriptionHash(subscription) {
  return createHash("sha256").update(subscription.endpoint).digest("hex");
}

export function expiredSubscriptionKey(endpointHash) {
  return `expired-subscriptions/${endpointHash}`;
}

export async function readState(store, key) {
  const result = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
  return result ? { data: result.data, etag: result.etag } : null;
}

export async function updateState(store, key, update, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await readState(store, key);
    const next = await update(current?.data ?? null);
    if (next === null) {
      if (!current) return null;
      await store.delete(key);
      return null;
    }
    const result = await store.setJSON(key, next, current?.etag
      ? { onlyIfMatch: current.etag }
      : { onlyIfNew: true });
    if (result.modified) return next;
  }
  throw new Error("The push schedule changed too many times to save safely. Please retry.");
}

export async function listSubscriptionKeys(store) {
  const result = await store.list({ prefix: SUBSCRIPTION_PREFIX, paginate: true });
  const keys = [];
  for await (const page of result) {
    keys.push(...page.blobs.map(({ key }) => key));
  }
  return keys;
}
