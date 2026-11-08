import test from "node:test";
import assert from "node:assert/strict";
import { fromDateKey, getOccurrences, getReminderInstancesForDate, isOverdue, toDateKey } from "../src/utils/dates.js";

process.env.TZ = "Asia/Karachi";

test("date keys round-trip local calendar dates", () => {
  const date = new Date(2026, 6, 4, 17, 30);
  assert.equal(toDateKey(date), "2026-07-04");
  assert.equal(toDateKey(fromDateKey("2026-07-04")), "2026-07-04");
});

test("local Asia/Karachi reminder times serialize to UTC only once", () => {
  const localReminder = new Date(2026, 0, 1, 1, 0);
  assert.equal(localReminder.toISOString(), "2025-12-31T20:00:00.000Z");
});

test("one-time and daily Asia/Karachi schedules handle an elapsed occurrence", () => {
  const now = new Date("2026-01-01T06:00:00.000Z");
  const oneTime = {
    id: "one-time",
    date: "2026-01-01",
    time: "10:58",
    times: ["10:58"],
    repeat: "never",
    completed: false,
  };
  const daily = { ...oneTime, id: "daily", repeat: "daily" };
  assert.deepEqual(getOccurrences(oneTime, now), []);
  const nextDailyOccurrence = getOccurrences(daily, now, 1);
  assert.equal(nextDailyOccurrence.length, 1);
  assert.equal(nextDailyOccurrence[0].date.toISOString(), "2026-01-02T05:58:00.000Z");
});

test("overdue checks compare a reminder's local date and time", () => {
  const now = new Date(2026, 3, 12, 15, 0);
  const reminder = (date, time, completed = false) => ({ date: toDateKey(date), time, completed });
  assert.equal(isOverdue(reminder(now, "14:00"), now), true);
  assert.equal(isOverdue(reminder(now, "16:00"), now), false);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(isOverdue(reminder(yesterday, "23:59"), now), true);
  assert.equal(isOverdue(reminder(yesterday, "09:00", true), now), false);
});

test("recurring reminders only become overdue after an actual occurrence", () => {
  const reminder = { id: "repeat-overdue", date: "2026-04-11", time: "16:00", repeat: "daily" };
  assert.equal(isOverdue(reminder, new Date(2026, 3, 12, 15, 0)), false);
  assert.equal(isOverdue(reminder, new Date(2026, 3, 12, 17, 0)), true);
});

test("daily reminders retain each alarm time", () => {
  const start = new Date(2026, 0, 1, 0);
  const reminder = { id: "daily", date: toDateKey(start), time: "09:00", times: ["09:00", "15:30"], repeat: "daily" };
  const occurrences = getOccurrences(reminder, new Date(2026, 0, 1, 8), 2);
  assert.equal(occurrences.length, 6);
  assert.equal(occurrences[0].date.getHours(), 9);
  assert.equal(occurrences[1].date.getHours(), 15);
});

test("custom weekday schedules use local calendar days", () => {
  const reminder = {
    id: "weekdays", date: "2026-01-04", time: "09:00", repeat: "weekdays", weekdays: [1, 3],
  };
  const occurrences = getOccurrences(reminder, new Date(2026, 0, 4, 8), 8);
  assert.deepEqual(occurrences.map(({ date }) => date.getDay()), [1, 3, 1]);
});

test("custom intervals count from the original start date", () => {
  const reminder = { id: "interval", date: "2026-01-01", time: "10:00", repeat: "custom", interval: 3, weekdays: [] };
  const occurrences = getOccurrences(reminder, new Date(2026, 0, 1, 9), 8);
  assert.deepEqual(occurrences.map(({ date }) => toDateKey(date)), ["2026-01-01", "2026-01-04", "2026-01-07"]);
});

test("daily reminders keep their local wall-clock time through DST", () => {
  const reminder = { id: "dst", date: "2026-03-07", time: "09:15", repeat: "daily" };
  const occurrences = getOccurrences(reminder, new Date(2026, 2, 7, 8), 2);
  assert.deepEqual(occurrences.map(({ date }) => [date.getHours(), date.getMinutes()]), [[9, 15], [9, 15], [9, 15]]);
});

test("monthly reminders skip dates missing from a month", () => {
  const reminder = { id: "monthly", date: "2026-01-31", time: "12:00", repeat: "monthly" };
  const occurrences = getOccurrences(reminder, new Date(2026, 0, 1), 90);
  assert.deepEqual(occurrences.map(({ date }) => toDateKey(date)), ["2026-01-31", "2026-03-31"]);
});

test("calendar dates include future instances of a recurring reminder", () => {
  const reminder = { id: "weekly", date: "2026-11-02", time: "09:00", times: ["09:00", "16:00"], repeat: "weekly" };
  const instance = getReminderInstancesForDate(reminder, "2026-11-09");
  assert.equal(instance.length, 1);
  assert.equal(instance[0].id, reminder.id);
  assert.equal(instance[0].date, "2026-11-09");
  assert.equal(instance[0].time, "09:00");
  assert.equal(getReminderInstancesForDate(reminder, "2026-11-10").length, 0);
});
