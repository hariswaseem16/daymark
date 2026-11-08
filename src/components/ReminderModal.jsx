import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toDateKey } from "../utils/dates";

const weekdays = [
  { label: "S", value: 0 }, { label: "M", value: 1 }, { label: "T", value: 2 },
  { label: "W", value: 3 }, { label: "T", value: 4 }, { label: "F", value: 5 }, { label: "S", value: 6 },
];

export default function ReminderModal({ reminder, categories, categoryId, defaultTime, selectedDate, onClose, onSave }) {
  const [form, setForm] = useState(() => reminder ? {
    ...reminder, times: reminder.times?.join(", ") || reminder.time,
  } : {
    title: "", description: "", date: selectedDate || toDateKey(new Date()),
    time: defaultTime || "09:00", times: defaultTime || "09:00", categoryId: categoryId || categories[0]?.id || "personal",
    priority: "medium", repeat: "never", interval: 1, weekdays: [], completed: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const handleSubmit = async (event) => {
    event.preventDefault();
    const times = form.times.split(",").map((value) => value.trim()).filter(Boolean);
    if (!form.title.trim() || !form.date || !times.length || times.some((value) => !/^\d{2}:\d{2}$/.test(value))) {
      setError("Add a title, date, and one or more valid times (HH:MM).");
      return;
    }
    if ((form.repeat === "weekdays" || form.repeat === "custom") && form.weekdays.length === 0) {
      setError("Choose at least one weekday for this repeat schedule.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form, title: form.title.trim(), description: form.description.trim(),
        times, time: times[0], interval: Math.max(1, Number(form.interval) || 1),
        id: reminder?.id || crypto.randomUUID(), createdAt: reminder?.createdAt || new Date().toISOString(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Could not save this reminder.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="reminder-modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
        <div className="modal-heading">
          <div><p className="eyebrow">{reminder ? "MAKE A LITTLE CHANGE" : "MAKE A LITTLE SPACE"}</p><h2 id="modal-heading">{reminder ? "Edit reminder" : "A new reminder"}</h2></div>
          <button className="icon-button close-modal" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="field-label">What would you like to remember?
            <input autoFocus maxLength={100} placeholder="A small thing worth remembering" value={form.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <label className="field-label">A note, if you need one
            <textarea maxLength={500} rows={2} placeholder="A little more context…" value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>
          <div className="form-grid">
            <label className="field-label">Date<input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label>
            <label className="field-label">Time · add more separated by commas<input type="text" inputMode="text" placeholder="09:00, 14:30" value={form.times} onChange={(event) => update("times", event.target.value)} /></label>
            <label className="field-label">List
              <select value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="field-label">Priority
              <select value={form.priority} onChange={(event) => update("priority", event.target.value)}>
                <option value="low">Whenever</option><option value="medium">Important</option><option value="high">High priority</option>
              </select>
            </label>
          </div>
          <label className="field-label">Repeat
            <select value={form.repeat} onChange={(event) => update("repeat", event.target.value)}>
              <option value="never">Does not repeat</option><option value="daily">Every day</option>
              <option value="weekly">Every week</option><option value="monthly">Every month</option>
              <option value="weekdays">Custom weekdays</option><option value="custom">Custom interval</option>
            </select>
          </label>
          {["weekdays", "custom"].includes(form.repeat) && (
            <div className="repeat-options">
              <div className="weekday-pills" role="group" aria-label="Repeat on weekdays">
                {weekdays.map((day) => {
                  const active = form.weekdays.includes(day.value);
                  return <button key={`${day.label}-${day.value}`} type="button" className={`weekday-pill ${active ? "active" : ""}`}
                    aria-label={`Repeat on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.value]}`}
                    aria-pressed={active} onClick={() => update("weekdays", active ? form.weekdays.filter((value) => value !== day.value) : [...form.weekdays, day.value])}>{day.label}</button>;
                })}
              </div>
            </div>
          )}
          {form.repeat === "custom" && (
            <label className="field-label">Repeat every
              <span className="interval-input"><input type="number" min="1" max="365" value={form.interval} onChange={(event) => update("interval", event.target.value)} /><span>days between repeats (weekly when weekdays are selected)</span></span>
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : reminder ? "Save changes" : "Create reminder"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
