import { useMemo } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Check, Clock3, Flame, Sparkles } from "lucide-react";
import { isOverdue, toDateKey } from "../utils/dates";

function makeLastDays(count, now) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (count - index - 1));
    return date;
  });
}

export default function InsightsScreen({ reminders, completions = [], now }) {
  const todayKey = toDateKey(now);
  const today = reminders.filter((reminder) => reminder.date === todayKey);
  const todayDone = today.filter((reminder) => reminder.completed).length;
  const completionRate = today.length ? Math.round(todayDone / today.length * 100) : 0;
  const overdue = reminders.filter((reminder) => isOverdue(reminder, now)).length;
  const completedTotal = completions.length + reminders.filter((reminder) => reminder.completed
    && !completions.some((completion) => completion.reminderId === reminder.id && completion.completedAt === reminder.completedAt)).length;
  const lastSevenDays = useMemo(() => makeLastDays(7, now).map((date) => {
    const key = toDateKey(date);
    const historyCount = completions.filter((completion) => completion.completedAt?.slice(0, 10) === key).length;
    return {
      date,
      total: reminders.filter((reminder) => reminder.date === key).length,
      done: historyCount
        + reminders.filter((reminder) => reminder.completed && (reminder.completedAt || "").slice(0, 10) === key
          && !completions.some((completion) => completion.reminderId === reminder.id && completion.completedAt === reminder.completedAt)).length,
    };
  }), [completions, now, reminders]);
  const recentHistory = lastSevenDays.reduce((sum, day) => sum + day.done, 0);
  const previousWeek = [...completions.map((item) => item.completedAt), ...reminders.filter((item) => item.completed && item.completedAt && !completions.some((completion) => completion.reminderId === item.id && completion.completedAt === item.completedAt)).map((item) => item.completedAt)]
    .filter((timestamp) => {
      const daysAgo = (now.getTime() - new Date(timestamp).getTime()) / 86400000;
      return daysAgo >= 7 && daysAgo < 14;
    }).length;
  const weeklyChange = previousWeek ? Math.round((recentHistory - previousWeek) / previousWeek * 100) : recentHistory ? 100 : 0;
  const streak = useMemo(() => {
    const completedDates = new Set([
      ...completions.map((completion) => completion.completedAt.slice(0, 10)),
      ...reminders.filter((reminder) => reminder.completedAt).map((reminder) => reminder.completedAt.slice(0, 10)),
    ]);
    let cursor = new Date(now);
    if (!completedDates.has(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (completedDates.has(toDateKey(cursor))) { count += 1; cursor.setDate(cursor.getDate() - 1); }
    return count;
  }, [completions, now, reminders]);
  const maxValue = Math.max(1, ...lastSevenDays.map((day) => day.total));

  return (
    <div className="page-content insights-page">
      <section className="insights-welcome"><div><p className="eyebrow">SMALL STEPS ADD UP</p><h2>Your progress, in perspective.</h2><p>A kind look back at the things you’ve made room for.</p></div><span className="insights-icon"><Activity size={21} /></span></section>
      <div className="stats-grid">
        <article className="stat-card stat-highlight"><div className="stat-card-top"><span className="stat-icon plum"><Check size={17} /></span><span className="eyebrow">TODAY’S MOMENTUM</span></div><strong className="stat-value">{completionRate}<small>%</small></strong><div className="stat-foot"><span>{todayDone} of {today.length} things tended to</span><div className="mini-bar"><i style={{ width: `${completionRate}%` }} /></div></div></article>
        <article className="stat-card"><div className="stat-card-top"><span className="stat-icon gold"><Flame size={17} /></span><span className="eyebrow">CURRENT STREAK</span></div><strong className="stat-value">{streak}<small> day{streak === 1 ? "" : "s"}</small></strong><span className="stat-caption">{streak ? "A lovely little rhythm." : "One small step can begin today."}</span></article>
        <article className="stat-card"><div className="stat-card-top"><span className="stat-icon mint"><Sparkles size={17} /></span><span className="eyebrow">COMPLETED, ALL TIME</span></div><strong className="stat-value">{completedTotal}</strong><span className="stat-caption">Each one, a little promise kept.</span></article>
        <article className="stat-card"><div className="stat-card-top"><span className="stat-icon rose"><Clock3 size={17} /></span><span className="eyebrow">PAST ITS MOMENT</span></div><strong className="stat-value">{overdue}</strong><span className="stat-caption">No judgment—just a gentle check-in.</span></article>
      </div>
      <div className="chart-row">
        <section className="chart-card"><div className="section-heading"><div><p className="eyebrow">A WEEK OF LITTLE WINS</p><h3>Daily rhythm</h3></div><span className="chart-legend"><i /> Completed</span></div>
          <div className="bar-chart">{lastSevenDays.map(({ date, total, done }) => <div className="chart-day" key={toDateKey(date)}><div className="bar-track">{total > 0 && <><i className="bar-total" style={{ height: `${Math.max(14, total / maxValue * 100)}%` }} /><i className="bar-done" style={{ height: `${Math.max(done ? 14 : 0, done / maxValue * 100)}%` }} /></>}</div><span>{date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1)}</span></div>)}</div>
          <div className={`chart-summary ${weeklyChange >= 0 ? "up" : "down"}`}>{weeklyChange >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Math.abs(weeklyChange)}% {weeklyChange >= 0 ? "more" : "fewer"} completions than the week before</div>
        </section>
        <section className="month-summary"><div className="side-card-heading"><span className="side-icon sky"><Activity size={17} /></span><span className="eyebrow">THIS MONTH</span></div><strong className="month-completed">{completions.filter((completion) => new Date(completion.completedAt).getMonth() === now.getMonth() && new Date(completion.completedAt).getFullYear() === now.getFullYear()).length + reminders.filter((reminder) => reminder.completed && reminder.completedAt && new Date(reminder.completedAt).getMonth() === now.getMonth() && new Date(reminder.completedAt).getFullYear() === now.getFullYear() && !completions.some((completion) => completion.reminderId === reminder.id && completion.completedAt === reminder.completedAt)).length}</strong><p>reminders completed this month</p><div className="month-days">{makeLastDays(21, now).map((date, index) => <i key={`${toDateKey(date)}-${index}`} className={completions.some((completion) => completion.completedAt?.slice(0, 10) === toDateKey(date)) || reminders.some((reminder) => reminder.completed && reminder.completedAt?.slice(0, 10) === toDateKey(date)) ? "active" : ""} />)}</div><span className="month-caption">A little, often, is a lot.</span></section>
      </div>
      <div className="stats-note"><span className="note-sparkle"><Sparkles size={15} /></span><p>Your progress isn’t a race. Every small task you finish is worth celebrating.</p><span className="note-flower">✳</span></div>
    </div>
  );
}
