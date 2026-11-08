import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import ReminderRow from "../components/ReminderRow";
import { fromDateKey, getReminderInstancesForDate, toDateKey } from "../utils/dates";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDates(date, weekStartsOn) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    return day;
  });
}

export default function CalendarScreen({ reminders, categories, settings, onAdd, onComplete, onEdit, onDelete, onSnooze, now }) {
  const [view, setView] = useState("month");
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(toDateKey(now));
  const todayKey = toDateKey(now);
  const weekStartsOn = Number(settings.weekStartsOn) || 0;
  const selectedDate = fromDateKey(selected);
  const displayDates = useMemo(() => {
    if (view === "day") return [selectedDate];
    if (view === "week") return getWeekDates(selectedDate, weekStartsOn);
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() - weekStartsOn + 7) % 7;
    return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - lead + 1));
  }, [month, selectedDate, view, weekStartsOn]);
  const remindersForSelected = reminders.flatMap((reminder) => getReminderInstancesForDate(reminder, selected))
    .sort((a, b) => a.time.localeCompare(b.time));
  const adjustedWeekdays = Array.from({ length: 7 }, (_, index) => weekDays[(weekStartsOn + index) % 7]);
  const changeMonth = (amount) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  const jumpDay = (amount) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount);
    setSelected(toDateKey(next));
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const calendarDays = displayDates.map((date) => {
    const key = toDateKey(date);
    const items = reminders.flatMap((reminder) => getReminderInstancesForDate(reminder, key));
    const outside = view === "month" && date.getMonth() !== month.getMonth();
    const today = key === todayKey;
    return <button key={key} className={`calendar-day ${selected === key ? "selected" : ""} ${today ? "today" : ""} ${outside ? "outside" : ""}`}
      aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${items.length} reminders`}
      aria-pressed={selected === key} onClick={() => setSelected(key)}>
      <span className="day-number">{date.getDate()}</span>
      <span className="day-dots">{items.slice(0, view === "month" ? 3 : 6).map((item) => <i key={item.id} className={item.completed ? "completed-dot" : ""} style={{ "--dot-color": categories.find((category) => category.id === item.categoryId)?.color || "#aaa6bd" }} />)}</span>
      {view !== "month" && items.slice(0, 3).map((item) => <span className={`week-event ${item.completed ? "event-complete" : ""}`} key={item.id}>{item.time} · {item.title}</span>)}
    </button>;
  });

  return (
    <div className="page-content calendar-page">
      <section className="calendar-toolbar">
        <div className="month-switcher">
          <button className="icon-button" aria-label="Previous month or day" onClick={() => view === "day" ? jumpDay(-1) : changeMonth(-1)}><ChevronLeft size={18} /></button>
          <h2>{view === "day" ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : view === "week" ? `Week of ${getWeekDates(selectedDate, weekStartsOn)[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : monthLabel}</h2>
          <button className="icon-button" aria-label="Next month or day" onClick={() => view === "day" ? jumpDay(1) : changeMonth(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="calendar-controls"><div className="segmented-control" role="group" aria-label="Calendar view">
          {["month", "week", "day"].map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </div><button className="button button-primary calendar-add" onClick={() => onAdd(selected)}><Plus size={15} /> New reminder</button></div>
      </section>

      <div className={`calendar-layout ${view === "day" ? "day-calendar-layout" : ""}`}>
        <section className={`calendar-card calendar-${view}`}>
          {view === "week" ? <div className="calendar-week-scroll">
            <div className="weekday-header">{adjustedWeekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
            <div className="calendar-grid calendar-grid-week">{calendarDays}</div>
          </div> : <>
            {view === "month" && <div className="weekday-header">{adjustedWeekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>}
            <div className={`calendar-grid calendar-grid-${view}`}>{calendarDays}</div>
          </>}
          {view === "month" && <div className="calendar-legend"><span><i className="legend-dot plum-dot" /> Reminder</span><span><i className="legend-dot sage-dot" /> Completed</span></div>}
        </section>
        <aside className="selected-day-card">
          <div className="section-heading"><div><p className="eyebrow">YOUR DAY, YOUR WAY</p><h3>{selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3></div><span className="calendar-count">{remindersForSelected.length}</span></div>
          {remindersForSelected.length ? <div className="task-list">{remindersForSelected.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} category={categories.find((category) => category.id === reminder.categoryId)} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} onSnooze={onSnooze} compact />)}</div>
            : <div className="calendar-empty"><CalendarDays size={20} /><strong>A blank page.</strong><p>No reminders here yet.</p><button className="text-button" onClick={() => onAdd(selected)}><Plus size={14} /> Add one</button></div>}
        </aside>
      </div>
    </div>
  );
}
