import { useRef, useState } from "react";
import { Bell, ChevronRight, Download, Moon, RotateCcw, Sun, Upload } from "lucide-react";

export default function SettingsScreen({ settings, permission, nativeNotifications, pushSyncError, onSettingsChange, onEnableNotifications, onToggleNotifications, onExport, onImport, onReset, onViewLists }) {
  const fileInput = useRef(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pushFeedback, setPushFeedback] = useState("");
  const [pushServerUrl, setPushServerUrl] = useState(settings.pushServerUrl || "");
  const [pushVapidPublicKey, setPushVapidPublicKey] = useState(settings.pushVapidPublicKey || "");
  const [nameDraft, setNameDraft] = useState(settings.name);

  const handleExport = async () => {
    setBackupBusy(true);
    try { await onExport(); setFeedback("Your backup is ready."); }
    catch (error) { setFeedback(error.message || "Could not export your backup."); }
    finally { setBackupBusy(false); }
  };
  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupBusy(true);
    try { await onImport(file); setFeedback("Your backup has been restored."); }
    catch (error) { setFeedback(error.message || "Could not restore this backup."); }
    finally { setBackupBusy(false); event.target.value = ""; }
  };
  const savePushConfiguration = async () => {
    if (!pushServerUrl.trim() || !pushVapidPublicKey.trim()) {
      setPushFeedback("Enter both the push-server URL and VAPID public key.");
      return;
    }
    try {
      if (settings.notificationsEnabled) await onToggleNotifications();
      await onSettingsChange({
        pushServerUrl: pushServerUrl.trim(),
        pushVapidPublicKey: pushVapidPublicKey.trim(),
      });
      setPushFeedback("Push-server settings saved. Enable Web Push to sync reminders.");
    } catch (error) {
      setPushFeedback(error.message || "Could not save push-server settings.");
    }
  };
  const notificationText = nativeNotifications
    ? permission === "granted" ? "Native reminders are allowed on this iPhone."
      : permission === "denied" ? "Notifications are off. Allow them in iPhone Settings."
        : "Scheduled locally on this iPhone when enabled."
    : permission === "install-required"
      ? "On iPhone, install Daymark from Safari’s Share menu and open it from your Home Screen to use Web Push."
      : permission === "unsupported"
        ? "This browser or connection does not support Web Push. Use HTTPS and a supported browser."
        : permission === "denied"
          ? "Notifications are blocked. Allow them in your browser’s site settings before enabling Web Push."
        : pushSyncError && settings.notificationsEnabled
            ? "The last server sync failed or was incomplete. Background delivery is not reliable until it succeeds."
          : settings.notificationsEnabled
            ? "The push server accepted the current schedule. Delivery still depends on that server."
            : "Browser reminders stay local unless a Web Push server is configured and connected.";

  return (
    <div className="page-content settings-page">
      <section className="settings-card appearance-card"><div className="settings-section-head"><div className="settings-illustration appearance-illustration"><Moon size={18} /></div><div><h3>Make yourself at home</h3><p>Choose the feel of your little corner.</p></div></div>
        <div className="theme-choices" role="group" aria-label="Color theme">
          {[["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", RotateCcw, "System"]].map(([value, Icon, label]) => <button key={value} className={`theme-option ${settings.theme === value ? "selected" : ""}`} onClick={() => onSettingsChange({ theme: value })}><Icon size={16} /><span>{label}</span>{settings.theme === value && <i />}</button>)}
        </div>
        <div className="setting-row setting-name-row"><div><strong>Your name</strong><span>Shown in your greeting.</span></div><input className="setting-name" type="text" maxLength={40} autoComplete="given-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} /><button className="button button-quiet save-name-button" disabled={!nameDraft.trim() || nameDraft.trim() === settings.name} onClick={() => onSettingsChange({ name: nameDraft.trim() })}>Save</button></div>
      </section>

      <section className="settings-card"><div className="settings-section-head"><div className="settings-illustration notification-illustration"><Bell size={18} /></div><div><h3>Little nudges</h3><p>{notificationText}</p></div></div>
        {nativeNotifications ? (
          <div className="setting-row"><div><strong>iPhone notifications</strong><span>Scheduled locally on your device, even when Daymark is closed.</span></div>{settings.notificationsEnabled && permission === "granted" ? <button role="switch" aria-checked="true" aria-label="iPhone notifications" className="toggle on" onClick={onToggleNotifications}><i /></button> : <button className="button button-primary small-button" onClick={onEnableNotifications}>{permission === "denied" ? "Try again" : "Enable notifications"}</button>}</div>
        ) : (
          <>
            <div className="push-config">
              <label className="push-config-field"><span>Push-server HTTPS URL</span><input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://your-server.example/push" value={pushServerUrl} onChange={(event) => setPushServerUrl(event.target.value)} /></label>
              <label className="push-config-field"><span>VAPID public key</span><input type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder="Generated by your push server" value={pushVapidPublicKey} onChange={(event) => setPushVapidPublicKey(event.target.value)} /></label>
              <button className="button button-quiet" onClick={savePushConfiguration}>Save Web Push setup</button>
              <p>Only the public key belongs here. Never enter your VAPID private key. Reminder titles and times are sent to this server for scheduling.</p>
              {pushFeedback && <p className="settings-feedback" role="status">{pushFeedback}</p>}
            </div>
            <div className="setting-row"><div><strong>Web Push reminders</strong><span>Requires a configured sender that confirms scheduled delivery.</span></div>{settings.notificationsEnabled ? <button role="switch" aria-checked="true" aria-label="Web Push reminders" className="toggle on" onClick={onToggleNotifications}><i /></button> : <button className="button button-primary small-button" onClick={onEnableNotifications} disabled={permission === "install-required" || permission === "unsupported" || permission === "denied" || !settings.pushServerUrl || !settings.pushVapidPublicKey}>{permission === "denied" ? "Allow in browser settings" : "Enable Web Push"}</button>}</div>
            <p className="push-delivery-note">No push server is bundled with Daymark. Notifications cannot arrive in the background until you configure, deploy, and test one.</p>
          </>
        )}
        <div className="setting-row"><div><strong>Default reminder time</strong><span>Pre-filled when you make a new reminder.</span></div><input className="setting-time" type="time" value={settings.defaultTime} onChange={(event) => onSettingsChange({ defaultTime: event.target.value })} /></div>
        <div className="setting-row"><div><strong>Start the week on</strong><span>Set the first day on your calendar.</span></div><select className="setting-select" value={settings.weekStartsOn} onChange={(event) => onSettingsChange({ weekStartsOn: Number(event.target.value) })}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={6}>Saturday</option></select></div>
        <div className="setting-row"><div><strong>Notification sound</strong><span>Use the iPhone’s default reminder sound.</span></div><button role="switch" aria-checked={settings.soundEnabled} aria-label="Notification sound" className={`toggle ${settings.soundEnabled ? "on" : ""}`} onClick={() => onSettingsChange({ soundEnabled: !settings.soundEnabled })}><i /></button></div>
        <div className="setting-row"><div><strong>Haptic feedback</strong><span>A little tap of reassurance, where supported.</span></div><button role="switch" aria-checked={settings.hapticsEnabled} aria-label="Haptic feedback" className={`toggle ${settings.hapticsEnabled ? "on" : ""}`} onClick={() => onSettingsChange({ hapticsEnabled: !settings.hapticsEnabled })}><i /></button></div>
        <div className="setting-row"><div><strong>Organize your lists</strong><span>Make a list for every part of your life.</span></div><button className="text-button setting-link" onClick={onViewLists}>Manage lists <ChevronRight size={14} /></button></div>
      </section>

      <section className="settings-card"><div className="settings-section-head"><div className="settings-illustration backup-illustration"><Download size={18} /></div><div><h3>Your data, always yours</h3><p>Daymark keeps your reminders on this device.</p></div></div>
        <div className="backup-actions"><button className="button button-quiet" onClick={handleExport} disabled={backupBusy}><Download size={15} /> Export a backup</button><button className="button button-quiet" onClick={() => fileInput.current?.click()} disabled={backupBusy}><Upload size={15} /> Restore a backup</button><input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleImport} /></div>
        {feedback && <p className="settings-feedback" role="status">{feedback}</p>}
      </section>

      <section className="settings-card danger-zone"><div className="settings-section-head"><div className="settings-illustration reset-illustration"><RotateCcw size={18} /></div><div><h3>A fresh start</h3><p>Remove your reminders and start with a clean slate.</p></div></div><button className="button button-danger" onClick={onReset}>Reset all app data</button></section>
      <p className="settings-version">Daymark · a little more room for what matters</p>
    </div>
  );
}
