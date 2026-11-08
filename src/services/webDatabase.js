const DATABASE_NAME = "daymark-browser";
const DATABASE_VERSION = 1;
const STORE_NAME = "appState";
const STATE_KEY = "current";
const LEGACY_STORAGE_KEY = "daymark.local.v1";
let databaseOpening;

function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("This browser does not support IndexedDB, which Daymark needs to store reminders."));
  }
  if (!databaseOpening) {
    databaseOpening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Could not open the Daymark database: ${request.error?.message || "unknown error"}`));
      request.onblocked = () => reject(new Error("The Daymark database is blocked by another open tab. Close other Daymark tabs and try again."));
    }).catch((error) => {
      databaseOpening = null;
      throw error;
    });
  }
  return databaseOpening;
}

function transact(database, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(new Error(transaction.error?.message || "The browser database transaction failed."));
    transaction.onabort = () => reject(new Error(transaction.error?.message || "The browser database transaction was canceled."));
    action(transaction.objectStore(STORE_NAME), (value) => { result = value; });
  });
}

export async function readBrowserData() {
  try {
    const database = await openDatabase();
    const saved = await transact(database, "readonly", (store, setResult) => {
      const request = store.get(STATE_KEY);
      request.onsuccess = () => setResult(request.result);
    });
    if (saved !== undefined) return saved;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) return null;

    let migrated;
    try {
      migrated = JSON.parse(legacy);
    } catch (error) {
      throw new Error(`Could not read the previous Daymark browser database: ${error.message}`);
    }
    await writeBrowserData(migrated);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch (error) {
    throw new Error(`Could not read the local Daymark database: ${error.message}`);
  }
}

export async function writeBrowserData(data) {
  try {
    const database = await openDatabase();
    await transact(database, "readwrite", (store) => store.put(data, STATE_KEY));
  } catch (error) {
    throw new Error(`Could not save your Daymark data: ${error.message}`);
  }
}
