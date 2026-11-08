import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Clock3, Plus, Sparkles } from "lucide-react";
import ReminderRow from "../components/ReminderRow";
import { fromDateKey, getOccurrences, getReminderInstancesForDate, isOverdue, toDateKey } from "../utils/dates";

export default function Dashboard({ reminders, completions = [], categories, onAdd, onComplete, onEdit, onDelete, onSnooze, greeting, clock, now }) {
  const todayKey = toDateKey(now);
  const todayReminders = useMemo(() => reminders.flatMap((reminder) => getReminderInstancesForDate(reminder, todayKey))
    .sort((a, b) => a.time.localeCompare(b.time)), [reminders, todayKey]);
  const completedOccurrences = completions.filter((completion) => {
    const reminder = reminders.find((item) => item.id === completion.reminderId);
    return reminder?.repeat !== "never" && toDateKey(new Date(completion.completedAt)) === todayKey;
  }).length;
  const completed = todayReminders.filter((reminder) => reminder.completed).length + completedOccurrences;
  const todayCount = todayReminders.length + completedOccurrences;
  const remaining = Math.max(0, todayCount - completed);
  const progress = todayCount ? Math.round(completed / todayCount * 100) : 0;
  const overdue = reminders.filter((reminder) => isOverdue(reminder, now) && !reminder.completed);
  const upcoming = reminders.filter((reminder) => !reminder.completed && (reminder.date >= todayKey || reminder.repeat !== "never"))
    .flatMap((reminder) => getOccurrences(reminder, now).map(({ date }) => ({ reminder, date })))
    .sort((a, b) => a.date - b.date);
  const next = upcoming[0];
  const daysUntilNext = next ? Math.max(0, Math.ceil((next.date.getTime() - now.getTime()) / 60_000)) : 0;
  const countdown = daysUntilNext < 60 ? `${daysUntilNext} min` : daysUntilNext < 1440 ? `${Math.floor(daysUntilNext / 60)}h ${daysUntilNext % 60}m` : `${Math.floor(daysUntilNext / 1440)}d ${Math.floor(daysUntilNext % 1440 / 60)}h`;
  const days = new Map();
  for (const { reminder, date } of upcoming) {
    const key = toDateKey(date);
    if (key <= todayKey) continue;
    const current = days.get(key) || [];
    if (!current.some((item) => item.id === reminder.id)) {
      current.push(reminder);
      days.set(key, current);
    }
  }
  const upcomingDays = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 3);
  const date = fromDateKey(todayKey);
  const dateTitle = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);

  return (
    <div className="page-content dashboard-page">
      <section className="welcome-strip">
        <div><span className="eyebrow">{dateTitle}</span><h2>{greeting}, Haris<span className="greeting-dot">.</span></h2><p>A little progress is still progress.</p></div>
        <div className="live-time"><Clock3 size={15} /><span>{clock}</span></div>
      </section>

      <div className="dashboard-grid">
        <div className="main-column">
          <section className="focus-card">
            <div className="focus-glow" />
            <div className="focus-copy"><span className="focus-kicker"><Sparkles size={13} /> YOUR DAY, AT YOUR PACE</span>
              <h3>{remaining ? `${remaining} little ${remaining === 1 ? "thing" : "things"} left.` : "A day well tended."}</h3>
              <p>{remaining ? "No rush. Just take the next right step." : "Make a little room for what’s next."}</p>
            </div>
            <div className="progress-ring" style={{ "--progress": `${progress}%` }}><div><strong>{progress}%</strong><span>done</span></div></div>
            <div className="focus-bottom"><span><Check size={14} /> {completed} of {todayCount} wrapped up</span><button className="focus-add" onClick={() => onAdd(todayKey)}><Plus size={15} /> Add a reminder</button></div>
          </section>

          {overdue.length > 0 && <section className="content-section overdue-section">
            <div className="section-heading"><div><p className="eyebrow">A GENTLE NUDGE</p><h3>Still on your mind</h3></div><span className="count-badge overdue-count">{overdue.length}</span></div>
            <div className="task-list">{overdue.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} category={categories.find((item) => item.id === reminder.categoryId)} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} onSnooze={onSnooze} />)}</div>
          </section>}

          <section className="content-section">
            <div className="section-heading"><div><p className="eyebrow">ONE THING AT A TIME</p><h3>Today <span className="heading-count">{todayReminders.length}</span></h3></div><button className="text-button" onClick={() => onAdd(todayKey)}><Plus size={15} /> New reminder</button></div>
            {todayReminders.length ? <div className="task-list">{todayReminders.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} category={categories.find((item) => item.id === reminder.categoryId)} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} onSnooze={onSnooze} />)}</div> : <div className="empty-note"><span className="empty-icon"><Sparkles size={18} /></span><div><strong>A little breathing room.</strong><p>Nothing planned just yet. Add something when you’re ready.</p></div></div>}
          </section>

          <section className="content-section upcoming-section">
            <div className="section-heading"><div><p className="eyebrow">ON THE HORIZON</p><h3>Coming up</h3></div><CalendarDays size={18} className="muted-icon" /></div>
            {upcomingDays.length ? <div className="upcoming-list">{upcomingDays.map(([day, tasks]) => (
              <div className="upcoming-day" key={day}><div className="upcoming-date"><strong>{fromDateKey(day).toLocaleDateString(undefined, { day: "2-digit" })}</strong><span>{fromDateKey(day).toLocaleDateString(undefined, { month: "short" })}</span></div>
                <div className="upcoming-day-info"><strong>{fromDateKey(day).toLocaleDateString(undefined, { weekday: "long" })}</strong><span>{tasks.length} {tasks.length === 1 ? "reminder" : "reminders"}</span></div>
                <div className="upcoming-dots">{tasks.slice(0, 3).map((task) => <span key={task.id} style={{ background: categories.find((item) => item.id === task.categoryId)?.color }} />)}</div><ChevronRight size={16} className="muted-icon" />
              </div>
            ))}</div> : <p className="muted-copy">Nothing else on the calendar for now.</p>}
          </section>
        </div>

        <aside className="side-column">
          <section className="side-card next-card"><div className="side-card-heading"><span className="side-icon plum"><Clock3 size={17} /></span><span className="eyebrow">UP NEXT</span><span className="live-dot" /></div>
            {next ? <><div className="next-countdown">{countdown}</div><p className="next-label">from now</p><div className="next-divider" /><strong className="next-task-title">{next.reminder.title}</strong><span className="next-task-time">{next.date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span><div className="next-category"><i style={{ background: categories.find((item) => item.id === next.reminder.categoryId)?.color }} />{categories.find((item) => item.id === next.reminder.categoryId)?.name}</div></> : <div className="empty-up-next"><Sparkles size={18} /><p>A little space to breathe.</p></div>}
          </section>
          <section className="side-card week-card"><div className="side-card-heading"><span className="side-icon mint"><CalendarDays size={17} /></span><span className="eyebrow">TODAY IN A NUTSHELL</span></div>
            <div className="mini-stat"><span>On your list</span><strong>{todayCount}</strong><ArrowUpRight size={15} /></div><div className="mini-stat"><span>Completed</span><strong>{completed}</strong><Check size={15} className="positive-icon" /></div><div className="mini-stat"><span>Still to do</span><strong>{remaining}</strong><ArrowDownRight size={15} className="muted-icon" /></div>
            <div className="week-progress"><span style={{ width: `${progress}%` }} /></div><span className="progress-footnote">{progress}% of today, gently done</span>
          </section>
          <div className="small-quote"><span>“</span><p>You don’t have to do it all. Just the next thing.</p></div>
        </aside>
      </div>
    </div>
  );
}
