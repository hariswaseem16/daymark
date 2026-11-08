import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { readBrowserData, writeBrowserData } from "../src/services/webDatabase.js";

test("migrates existing localStorage data to IndexedDB and persists later updates", async () => {
  const values = new Map([["daymark.local.v1", JSON.stringify({ reminders: [{ id: "legacy" }] })]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };

  const migrated = await readBrowserData();
  assert.deepEqual(migrated, { reminders: [{ id: "legacy" }] });
  assert.equal(values.has("daymark.local.v1"), false);

  const updated = {
    reminders: [{ id: "saved" }],
    snoozes: [{ id: "snooze-1", reminderId: "saved", scheduledAt: "2026-07-04T17:40:00.000Z" }],
  };
  await writeBrowserData(updated);
  assert.deepEqual(await readBrowserData(), updated);
});

test("persists created, edited, completed reminders and separate snoozes", async () => {
  const reminder = {
    id: "crud-reminder",
    title: "Created",
    date: "2026-07-04",
    time: "09:00",
    completed: false,
  };
  await writeBrowserData({ reminders: [reminder], snoozes: [] });
  assert.equal((await readBrowserData()).reminders[0].title, "Created");

  const edited = { ...reminder, title: "Edited", time: "10:30" };
  await writeBrowserData({
    reminders: [{ ...edited, completed: true }],
    snoozes: [{
      id: "crud-snooze",
      reminderId: reminder.id,
      title: edited.title,
      body: "Snoozed reminder",
      scheduledAt: "2026-07-04T17:40:00.000Z",
      createdAt: "2026-07-04T17:30:00.000Z",
    }],
  });
  const saved = await readBrowserData();
  assert.equal(saved.reminders[0].title, "Edited");
  assert.equal(saved.reminders[0].completed, true);
  assert.equal(saved.snoozes[0].reminderId, reminder.id);
});
