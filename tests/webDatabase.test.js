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

  const updated = { reminders: [{ id: "saved" }] };
  await writeBrowserData(updated);
  assert.deepEqual(await readBrowserData(), updated);
});
