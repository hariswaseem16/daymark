import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Command, LayoutDashboard,
  ListTodo, Plus, Settings2, Sparkles, Tag, X,
} from "lucide-react";
import CalendarScreen from "./screens/CalendarScreen";
import Dashboard from "./screens/Dashboard";
import InsightsScreen from "./screens/InsightsScreen";
import ListsScreen from "./screens/ListsScreen";
import RemindersScreen from "./screens/RemindersScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ReminderModal from "./components/ReminderModal";
import { clearDatabase, exportDatabase, importDatabase, initializeDatabase, saveDatabase } from "./services/database";
import { addNotificationListener, getNotificationPermission, isNativeNotificationPlatform, registerNotificationActions, requestNotificationPermission, subscribeToWebPush, syncNotifications, triggerHaptic } from "./services/notifications";
import { fromDateKey, getOccurrences, toDateKey } from "./utils/dates";
import { createSnoozeEntry } from "./utils/snooze";

const navigation = [
  { id: "home", label: "Today", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reminders", label: "Reminders", icon: ListTodo },
  { id: "lists", label: "My lists", icon: Tag },
  { id: "insights", label: "Insights", icon: Activity },
];
const pageNames = {
  home: ["A LITTLE MORE INTENTION", "Today"],
  calendar: ["FIND YOUR OWN RHYTHM", "Calendar"],
  reminders: ["EVERY LITTLE THING", "Reminders"],
  lists: ["LIFE, IN ITS LITTLE PARTS", "My lists"],
  insights: ["A KIND LOOK BACK", "Your progress"],
  settings: ["JUST THE WAY YOU LIKE IT", "Settings"],
};

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function webPushNeedsAttention(result, settings) {
  return !isNativeNotificationPlatform() && settings.notificationsEnabled
    && (result.configured === false || result.subscriptionRequired || result.unavailable || result.incomplete);
}

function App() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState("home");
  const [modal, setModal] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [permission, setPermission] = useState("unknown");
  const [pushSyncError, setPushSyncError] = useState(false);
  const [toast, setToast] = useState("");
  const [fatalError, setFatalError] = useState("");
  const actionsRef = useRef({});
  const toastTimer = useRef();

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3800);
  }, []);

  useEffect(() => {
    let active = true;
    initializeDatabase().then((initialData) => {
      if (!active) return;
      setData(initialData);
      if (initialData.settings.notificationsEnabled) {
        registerNotificationActions()
          .then(() => syncNotifications(initialData.reminders, initialData.settings, initialData.snoozes || []))
          .then((result) => { if (active) setPushSyncError(webPushNeedsAttention(result, initialData.settings)); })
          .catch((error) => {
            if (active) {
              setPushSyncError(true);
              notify(`Could not restore scheduled notifications: ${error.message}`);
            }
          });
      }
    }).catch((error) => {
      if (active) setFatalError(`Daymark couldn't open its local database. ${error.message}`);
    });
    getNotificationPermission().then((status) => { if (active) setPermission(status); })
      .catch((error) => { if (active) notify(`Could not check notification permissions: ${error.message}`); });
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => { active = false; window.clearInterval(timer); window.clearTimeout(toastTimer.current); };
  }, [notify]);

  const commit = useCallback(async (nextData) => {
    await saveDatabase(nextData);
    setData(nextData);
    let schedulingResult = { scheduled: 0 };
    if (nextData.settings.notificationsEnabled) {
      try {
        schedulingResult = await syncNotifications(nextData.reminders, nextData.settings, nextData.snoozes || []);
        setPushSyncError(webPushNeedsAttention(schedulingResult, nextData.settings));
        if (schedulingResult.capped) notify("Your iPhone can hold up to 60 scheduled reminders at once.");
      } catch (error) {
        setPushSyncError(true);
        schedulingResult = { scheduled: 0, error };
        notify(`Your reminder was saved, but its notification couldn't be scheduled: ${error.message}`);
      }
    }
    return schedulingResult;
  }, [notify]);

  const updateSettings = useCallback(async (changes) => {
    if (!data) return;
    await commit({ ...data, settings: { ...data.settings, ...changes } });
  }, [commit, data]);

  const saveReminder = useCallback(async (reminder) => {
    const reminders = data.reminders.some((item) => item.id === reminder.id)
      ? data.reminders.map((item) => item.id === reminder.id ? reminder : item)
      : [...data.reminders, reminder];
    await commit({ ...data, reminders });
  }, [commit, data]);

  const completeReminder = useCallback(async (reminder) => {
    if (!data) return;
    const completedAt = new Date().toISOString();
    const reminders = data.reminders.map((item) => {
      if (item.id !== reminder.id) return item;
      if (item.repeat && item.repeat !== "never" && !item.completed) {
        const now = new Date();
        const instanceEnd = fromDateKey(reminder.date);
        instanceEnd.setHours(23, 59, 59, 999);
        const afterInstance = instanceEnd > now ? instanceEnd : now;
        const next = getOccurrences(item, afterInstance, 400)[0];
        if (next) return { ...item, date: toDateKey(next.date), time: next.date.toTimeString().slice(0, 5), completedAt };
      }
      return { ...item, completed: !item.completed, completedAt: item.completed ? undefined : completedAt };
    });
    const completions = reminder.completed ? (data.completions || []) : [
      ...(data.completions || []),
      { id: crypto.randomUUID(), reminderId: reminder.id, categoryId: reminder.categoryId, completedAt },
    ];
    await commit({
      ...data,
      reminders,
      completions,
      snoozes: (data.snoozes || []).filter((snooze) => snooze.reminderId !== reminder.id),
    });
    if (data.settings.hapticsEnabled) {
      triggerHaptic(true).catch((error) => notify(`Reminder saved, but haptic feedback failed: ${error.message}`));
    }
  }, [commit, data, notify]);

  const deleteReminder = useCallback(async (reminder) => {
    if (!data || !window.confirm(`Delete “${reminder.title}”? This can’t be undone.`)) return;
    await commit({
      ...data,
      reminders: data.reminders.filter((item) => item.id !== reminder.id),
      snoozes: (data.snoozes || []).filter((snooze) => snooze.reminderId !== reminder.id),
    });
    notify("Reminder deleted.");
  }, [commit, data, notify]);

  const snooze = useCallback(async (reminder, sourceSnoozeId) => {
    if (!data) return;
    try {
      const snoozeEntry = createSnoozeEntry(reminder, 10);
      const currentTime = Date.now();
      const snoozes = (data.snoozes || []).filter((item) => item.id !== sourceSnoozeId
        && Date.parse(item.scheduledAt) > currentTime);
      const result = await commit({ ...data, snoozes: [...snoozes, snoozeEntry] });
      if (result.error) {
        notify(`Snooze saved in Daymark, but notification scheduling failed: ${result.error.message}`);
      } else if (!data.settings.notificationsEnabled) {
        notify("Snoozed in Daymark. Enable notifications to receive it at the snooze time.");
      } else if (isNativeNotificationPlatform() && result.permission && result.permission !== "granted") {
        notify("Snoozed in Daymark. Allow iPhone notifications to receive it at the snooze time.");
      } else if (!isNativeNotificationPlatform()
        && (result.unavailable || result.configured === false || result.subscriptionRequired || result.permission !== "granted")) {
        notify("Snoozed in Daymark, but background delivery is unavailable until Web Push is configured and enabled.");
      } else {
        notify("Snoozed for 10 minutes.");
      }
    } catch (error) {
      notify(`Couldn't snooze this reminder: ${error.message}`);
    }
  }, [commit, data, notify]);

  const scheduleAfterPermission = useCallback(async () => {
    try {
      const status = await requestNotificationPermission();
      setPermission(status);
      if (status === "granted" && data) {
        if (!isNativeNotificationPlatform()) await subscribeToWebPush(data.settings);
        else await registerNotificationActions();
        const settings = { ...data.settings, notificationsEnabled: true };
        const result = await commit({ ...data, settings });
        if (result.error) return;
        if (isNativeNotificationPlatform()) {
          notify(`${result.scheduled} iPhone ${result.scheduled === 1 ? "notification" : "notifications"} scheduled.`);
        } else if (result.incomplete) {
          notify(`Your push server scheduled ${result.scheduled} of ${result.requested} reminders. Background delivery is incomplete.`);
        } else if (result.configured === false || result.subscriptionRequired || result.unavailable) {
          notify("Web Push was not scheduled. Check the server setup and notification permission in Settings.");
        } else {
          notify(`${result.scheduled} reminders sent to your Web Push server for scheduling.`);
        }
      } else {
        await updateSettings({ notificationsEnabled: false });
        notify(status === "denied" ? "Notifications were declined. You can allow them in iPhone Settings." : "Notifications are not available.");
      }
    } catch (error) {
      notify(`Couldn't enable notifications: ${error.message}`);
    }
  }, [commit, data, notify, updateSettings]);

  const disableNotifications = useCallback(async () => {
    try {
      await updateSettings({ notificationsEnabled: false });
      await syncNotifications([], { ...data.settings, notificationsEnabled: false });
      setPushSyncError(false);
      notify(isNativeNotificationPlatform() ? "iPhone notifications are off." : "Web Push notifications are off.");
    } catch (error) {
      notify(`Couldn't turn off notifications: ${error.message}`);
    }
  }, [data, notify, updateSettings]);

  const addCategory = useCallback(async (category) => {
    await commit({ ...data, categories: [...data.categories, category] });
  }, [commit, data]);
  const deleteCategory = useCallback(async (category) => {
    const reminders = data.reminders.map((reminder) => reminder.categoryId === category.id ? { ...reminder, categoryId: "personal" } : reminder);
    await commit({ ...data, reminders, categories: data.categories.filter((item) => item.id !== category.id) });
    notify(`“${category.name}” was removed. Its reminders are now in Personal.`);
  }, [commit, data, notify]);

  const notificationActions = useMemo(() => ({ completeReminder, snooze, data }), [completeReminder, data, snooze]);
  useEffect(() => { actionsRef.current = notificationActions; }, [notificationActions]);
  useEffect(() => {
    let removeActionListener;
    registerNotificationActions().catch((error) => notify(`Could not register notification actions: ${error.message}`));
    removeActionListener = addNotificationListener("localNotificationActionPerformed", async (event) => {
      const { actionId, notification } = event;
      const reminder = actionsRef.current.data?.reminders.find((item) => item.id === notification.extra?.reminderId);
      if (!reminder) return;
      if (actionId === "snooze") await actionsRef.current.snooze(reminder, notification.extra?.snoozeId);
      if (actionId === "done") await actionsRef.current.completeReminder(reminder);
    });
    return () => removeActionListener();
  }, [notify]);

  useEffect(() => {
    const refresh = () => {
      const currentData = actionsRef.current.data;
      if (document.visibilityState === "visible" && currentData?.settings.notificationsEnabled) {
        syncNotifications(currentData.reminders, currentData.settings, currentData.snoozes || []).catch((error) => notify(`Could not refresh notifications: ${error.message}`));
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [notify]);

  const currentTheme = data?.settings.theme;
  useEffect(() => {
    if (!currentTheme) return undefined;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = currentTheme === "system"
        ? (prefersDark.matches ? "dark" : "light")
        : currentTheme;
    };
    applyTheme();
    prefersDark.addEventListener?.("change", applyTheme);
    return () => prefersDark.removeEventListener?.("change", applyTheme);
  }, [currentTheme]);

  const openAdd = useCallback((date, categoryId) => {
    setSelectedDate(date || toDateKey(new Date()));
    setModal({ reminder: null, categoryId });
  }, []);
  const openEdit = useCallback((reminder) => { setSelectedDate(reminder.date); setModal({ reminder }); }, []);
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (page === "reminders") document.getElementById("reminder-search")?.focus();
        else openAdd();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [openAdd, page]);
  const handleAdd = (date) => openAdd(date);
  const handleImport = async (file) => {
    if (!window.confirm("Restoring a backup replaces the reminders, lists, and settings on this device. Continue?")) return;
    const parsed = JSON.parse(await file.text());
    const previousSettings = data.settings;
    const restored = await importDatabase(parsed);
    setData(restored);
    if (restored.settings.notificationsEnabled) await syncNotifications(restored.reminders, restored.settings, restored.snoozes || []);
    else if (!isNativeNotificationPlatform()) {
      await syncNotifications([], { ...previousSettings, notificationsEnabled: false }, []);
    }
  };
  const handleExport = async () => {
    const blob = await exportDatabase(data);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `daymark-backup-${toDateKey(new Date())}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const handleReset = async () => {
    if (!window.confirm("Remove all reminders, categories, and settings? This cannot be undone. Export a backup first if you’d like to keep a copy.")) return;
    try {
      const empty = await clearDatabase();
      setData(empty);
      let message = "Daymark has a fresh start.";
      try {
        await syncNotifications([], { ...data.settings, notificationsEnabled: false }, []);
      } catch (error) {
        message = `Daymark was reset, but notifications could not be cleared from the server: ${error.message}`;
      }
      setPermission(await getNotificationPermission());
      setPushSyncError(false);
      notify(message);
    } catch (error) {
      notify(`Couldn't reset app data: ${error.message}`);
    }
  };

  if (fatalError) return <main className="error-screen"><span className="error-sparkle"><CircleHelp size={25} /></span><h1>A small pause.</h1><p>{fatalError}</p><button className="button button-primary" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!data) return <main className="loading-screen"><span className="loading-mark"><Sparkles size={20} /></span><p>Making a little room…</p></main>;

  const [eyebrow, title] = pageNames[page];
  const todayKey = toDateKey(clock);
  const displayName = data.settings.name.trim() || "there";
  const openCount = data.reminders.filter((reminder) => !reminder.completed && reminder.date >= todayKey).length;
  const currentLabel = navigation.find((item) => item.id === page)?.label || "Settings";
  const switchPage = (nextPage) => { setPage(nextPage); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const onSnooze = snooze;
  const renderPage = () => {
    const common = { reminders: data.reminders, categories: data.categories, onComplete: completeReminder, onEdit: openEdit, onDelete: deleteReminder, onSnooze };
    if (page === "home") return <Dashboard {...common} onAdd={handleAdd} greeting={greetingFor(clock.getHours())} name={displayName} clock={clock.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} now={clock} />;
    if (page === "calendar") return <CalendarScreen {...common} settings={data.settings} onAdd={handleAdd} now={clock} />;
    if (page === "reminders") return <RemindersScreen {...common} onAdd={handleAdd} />;
    if (page === "lists") return <ListsScreen {...common} onAdd={openAdd} onCategoryAdd={addCategory} onCategoryDelete={deleteCategory} />;
    if (page === "insights") return <InsightsScreen reminders={data.reminders} completions={data.completions || []} now={clock} />;
    return <SettingsScreen key={JSON.stringify([data.settings.pushServerUrl, data.settings.pushApiToken, data.settings.name])} settings={data.settings} permission={permission} nativeNotifications={isNativeNotificationPlatform()} pushSyncError={pushSyncError} onSettingsChange={updateSettings} onEnableNotifications={scheduleAfterPermission} onToggleNotifications={disableNotifications} onExport={handleExport} onImport={handleImport} onReset={handleReset} onViewLists={() => switchPage("lists")} />;
  };

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <button className="brand-lockup" onClick={() => switchPage("home")} aria-label="Daymark home"><span className="brand-mark"><Sparkles size={17} /></span><span className="brand-name">daymark<span>.</span></span></button>
        <div className="sidebar-date"><span className="eyebrow">YOUR LITTLE SPACE</span><p>{clock.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p></div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-section-label">YOUR SPACE</span>
          {navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => switchPage(id)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "reminders" && <span className="nav-count">{openCount}</span>}</button>)}
          <span className="nav-section-label preferences-label">A LITTLE EXTRA</span>
          <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => switchPage("settings")}><Settings2 size={17} strokeWidth={1.8} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><span className="note-star"><Sparkles size={15} /></span><p>Make room for what matters.</p><span>One thing at a time.</span></div><button className="profile-button" onClick={() => switchPage("settings")}><span className="profile-avatar">{displayName[0].toUpperCase()}</span><span><strong>{displayName}</strong><small>Just for you</small></span><ChevronDown size={15} /></button></div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Sparkles size={16} /></span><span className="brand-name">daymark<span>.</span></span></div><div className="breadcrumb"><span>YOUR SPACE</span><span className="breadcrumb-slash">/</span><strong>{currentLabel}</strong></div><div className="topbar-actions"><span className="topbar-clock"><Clock3 size={14} />{clock.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span><button className="icon-button notification-button" aria-label="Notification settings" onClick={() => switchPage("settings")}><Bell size={17} />{permission === "granted" && <i />}</button><button className="add-task-button" onClick={() => openAdd()}><Plus size={16} /><span>New reminder</span><kbd><Command size={11} /> K</kbd></button></div></header>
        <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><div className="page-title-date"><span>{clock.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><div className="mini-calendar-icon"><CalendarDays size={15} /></div></div></div>
        {renderPage()}
        <footer className="app-footer"><span>DAYMARK <i>·</i> JUST FOR YOU</span><span>Offline by nature <span className="footer-heart">✳</span></span></footer>
      </main>

      <nav className="mobile-tabbar" aria-label="Main navigation">
        {navigation.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => switchPage(id)}><Icon size={19} strokeWidth={page === id ? 2 : 1.7} /><span>{label}</span></button>)}
        <button className={page === "settings" ? "active" : ""} onClick={() => switchPage("settings")}><Settings2 size={19} /><span>Settings</span></button>
      </nav>
      <button className="mobile-fab" onClick={() => openAdd()} aria-label="Add reminder"><Plus size={22} /></button>
      {modal && <ReminderModal reminder={modal.reminder} categoryId={modal.categoryId} categories={data.categories} defaultTime={data.settings.defaultTime} selectedDate={selectedDate} onClose={() => setModal(null)} onSave={saveReminder} />}
      {toast && <div role="status" className="toast-message"><span className="toast-mark"><Check size={14} /></span>{toast}<button aria-label="Dismiss message" onClick={() => setToast("")}><X size={14} /></button></div>}
    </div>
  );
}

export default App;
