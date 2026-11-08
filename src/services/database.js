import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { Share } from "@capacitor/share";
import { starterCategories, starterReminders, defaultSettings } from "../data/defaults";
import { fromDateKey, toDateKey } from "../utils/dates";
import { readBrowserData, writeBrowserData } from "./webDatabase";

const DATABASE_NAME = "daymark";
let connection;
let nativeReady = false;
let nativeInitialization;
const sqlite = new SQLiteConnection(CapacitorSQLite);

async function initializeNative() {
  if (nativeReady) return;
  if (!nativeInitialization) {
    nativeInitialization = (async () => {
      connection = await sqlite.createConnection(DATABASE_NAME, false, "no-encryption", 1, false);
      await connection.open();
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
          date TEXT NOT NULL, time TEXT NOT NULL, times TEXT NOT NULL, categoryId TEXT NOT NULL,
          priority TEXT NOT NULL, repeat TEXT NOT NULL, interval INTEGER NOT NULL,
          weekdays TEXT NOT NULL, completed INTEGER NOT NULL, completedAt TEXT, createdAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS reminders_date_idx ON reminders(date);
        CREATE TABLE IF NOT EXISTS completion_history (
          id TEXT PRIMARY KEY NOT NULL, reminderId TEXT NOT NULL, completedAt TEXT NOT NULL, categoryId TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_schedule (
          notificationId INTEGER PRIMARY KEY NOT NULL, reminderId TEXT NOT NULL, at TEXT NOT NULL
        );
      `);
      nativeReady = true;
    })().catch((error) => {
      nativeInitialization = null;
      throw error;
    });
  }
  await nativeInitialization;
}

async function nativeQuery(sql, values = []) {
  const result = await connection.query(sql, values);
  return result.values || [];
}

async function seedNative() {
  const rows = await nativeQuery("SELECT value FROM settings WHERE key = 'appDataInitialized'");
  if (rows.length) return;
  await replaceNative({ reminders: starterReminders, categories: starterCategories, settings: defaultSettings });
}

async function replaceNative(data) {
  const statements = [
    { statement: "DELETE FROM reminders;" },
    { statement: "DELETE FROM categories;" },
    { statement: "DELETE FROM settings;" },
    { statement: "DELETE FROM completion_history;" },
    ...data.categories.map((category) => ({
      statement: "INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)",
      values: [category.id, category.name, category.color, category.icon],
    })),
    ...data.reminders.map((reminder) => ({
      statement: `INSERT INTO reminders
        (id, title, description, date, time, times, categoryId, priority, repeat, interval, weekdays, completed, completedAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [reminder.id, reminder.title, reminder.description || "", reminder.date, reminder.time,
        JSON.stringify(reminder.times || [reminder.time]), reminder.categoryId, reminder.priority,
        reminder.repeat, Number(reminder.interval) || 1, JSON.stringify(reminder.weekdays || []),
        reminder.completed ? 1 : 0, reminder.completedAt || null, reminder.createdAt || new Date().toISOString()],
    })),
    ...Object.entries(data.settings).map(([key, value]) => ({
      statement: "INSERT INTO settings (key, value) VALUES (?, ?)",
      values: [key, JSON.stringify(value)],
    })),
    { statement: "INSERT INTO settings (key, value) VALUES (?, ?)", values: ["appDataInitialized", "true"] },
    ...(data.completions || []).map((completion) => ({
      statement: "INSERT INTO completion_history (id, reminderId, completedAt, categoryId) VALUES (?, ?, ?, ?)",
      values: [completion.id, completion.reminderId, completion.completedAt, completion.categoryId || "other"],
    })),
  ];
  await connection.executeSet(statements);
  await Preferences.set({ key: "daymark.settings", value: JSON.stringify(data.settings) });
}

async function loadNative() {
  const reminders = await nativeQuery("SELECT * FROM reminders ORDER BY date, time");
  const categories = await nativeQuery("SELECT * FROM categories ORDER BY name");
  const completions = await nativeQuery("SELECT * FROM completion_history ORDER BY completedAt DESC");
  const settingRows = await nativeQuery("SELECT key, value FROM settings WHERE key != 'appDataInitialized'");
  const savedSettings = await Preferences.get({ key: "daymark.settings" });
  return {
    reminders: reminders.map((reminder) => ({
      ...reminder, times: JSON.parse(reminder.times), weekdays: JSON.parse(reminder.weekdays),
      completed: Boolean(reminder.completed),
    })),
    categories,
    completions,
    settings: {
      ...defaultSettings,
      ...Object.fromEntries(settingRows.map(({ key, value }) => [key, JSON.parse(value)])),
      ...(savedSettings.value ? JSON.parse(savedSettings.value) : {}),
    },
  };
}

export async function initializeDatabase() {
  if (!Capacitor.isNativePlatform()) {
    let data = await readBrowserData();
    if (!data) {
      data = { reminders: starterReminders, categories: starterCategories, settings: defaultSettings, completions: [] };
      await writeBrowserData(data);
    } else {
      data = {
        ...data,
        categories: data.categories || starterCategories,
        settings: { ...defaultSettings, ...data.settings },
        completions: data.completions || [],
      };
      await writeBrowserData(data);
    }
    return data;
  }
  await initializeNative();
  await seedNative();
  return loadNative();
}

export async function saveDatabase(data) {
  if (!Capacitor.isNativePlatform()) {
    await writeBrowserData(data);
    return;
  }
  await initializeNative();
  await replaceNative(data);
}

export async function saveNotificationSchedule(notifications) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  await initializeNative();
  await connection.execute("DELETE FROM notification_schedule;");
  for (const notification of notifications) {
    await connection.run(
      "INSERT INTO notification_schedule (notificationId, reminderId, at) VALUES (?, ?, ?)",
      [notification.notificationId, notification.reminderId, notification.at],
    );
  }
}

export async function exportDatabase(data) {
  const contents = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
  if (Capacitor.isNativePlatform()) {
    const path = `daymark-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = await Filesystem.writeFile({
      path, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8,
    });
    await Share.share({ title: "Daymark backup", text: "A private backup of your Daymark reminders.", url: file.uri });
    return null;
  }
  return new Blob([contents], { type: "application/json" });
}

export async function importDatabase(data) {
  if (!data || !Array.isArray(data.reminders) || !Array.isArray(data.categories) || !data.settings) {
    throw new Error("This file is not a valid Daymark backup.");
  }
  const categoryIds = new Set(data.categories.map((category) => category?.id));
  const validTime = (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const validDate = (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && toDateKey(fromDateKey(date)) === date;
  const validCategories = data.categories.every((category) => category
    && typeof category.id === "string" && category.id
    && typeof category.name === "string" && category.name.trim()
    && typeof category.color === "string" && typeof category.icon === "string");
  const validReminders = data.reminders.every((reminder) => reminder
    && typeof reminder.id === "string" && reminder.id
    && typeof reminder.title === "string" && reminder.title.trim()
    && validDate(reminder.date) && validTime(reminder.time)
    && Array.isArray(reminder.times) && reminder.times.length > 0 && reminder.times.every(validTime)
    && categoryIds.has(reminder.categoryId)
    && ["low", "medium", "high"].includes(reminder.priority)
    && ["never", "daily", "weekly", "monthly", "weekdays", "custom"].includes(reminder.repeat)
    && Number.isInteger(Number(reminder.interval)) && Number(reminder.interval) >= 1
    && Number(reminder.interval) <= 365
    && Array.isArray(reminder.weekdays) && reminder.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && typeof reminder.completed === "boolean");
  const validSettings = ["system", "light", "dark"].includes(data.settings.theme)
    && validTime(data.settings.defaultTime)
    && [0, 1, 6].includes(Number(data.settings.weekStartsOn))
    && typeof data.settings.notificationsEnabled === "boolean"
    && typeof data.settings.soundEnabled === "boolean"
    && typeof data.settings.hapticsEnabled === "boolean"
    && (data.settings.pushServerUrl === undefined || typeof data.settings.pushServerUrl === "string")
    && (data.settings.pushVapidPublicKey === undefined || typeof data.settings.pushVapidPublicKey === "string");
  const validCompletions = (data.completions || []).every((completion) => completion
    && typeof completion.id === "string" && typeof completion.reminderId === "string"
    && !Number.isNaN(Date.parse(completion.completedAt)));
  if (!validCategories || !validReminders || !validSettings || !validCompletions) {
    throw new Error("This backup contains incomplete or invalid Daymark data.");
  }
  const restored = {
    reminders: data.reminders,
    categories: data.categories,
    settings: { ...defaultSettings, ...data.settings },
    completions: data.completions || [],
  };
  await saveDatabase(restored);
  return restored;
}

export async function clearDatabase() {
  const empty = { reminders: [], categories: starterCategories, settings: defaultSettings, completions: [] };
  await saveDatabase(empty);
  return empty;
}
