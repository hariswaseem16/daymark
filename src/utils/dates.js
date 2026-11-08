export const pad = (value) => String(value).padStart(2, "0");

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hours, minutes));
}

export function getOccurrences(reminder, from = new Date(), daysAhead = 45) {
  if (reminder.completed) return [];
  const alarms = reminder.times?.length ? reminder.times : [reminder.time || "09:00"];
  const occurrences = [];
  const start = fromDateKey(reminder.date);
  const end = new Date(from.getFullYear(), from.getMonth(), from.getDate() + daysAhead + 1);
  const firstDay = new Date(Math.max(start.getTime(), new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()));
  const frequency = reminder.repeat || "never";
  const interval = Math.max(1, Number(reminder.interval) || 1);

  for (let cursor = firstDay; cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    const daysSinceStart = Math.round((cursor - start) / 86400000);
    const weeksSinceStart = Math.floor(daysSinceStart / 7);
    const monthsSinceStart = (cursor.getFullYear() - start.getFullYear()) * 12
      + cursor.getMonth() - start.getMonth();
    const weekdayMatches = reminder.weekdays?.includes(cursor.getDay());
    const matches = frequency === "never"
      ? daysSinceStart === 0
      : frequency === "daily"
        ? daysSinceStart % interval === 0
        : frequency === "weekly"
          ? daysSinceStart % (7 * interval) === 0
          : frequency === "monthly"
            ? monthsSinceStart % interval === 0 && cursor.getDate() === start.getDate()
            : frequency === "weekdays"
              ? weekdayMatches
              : frequency === "custom"
                ? (reminder.weekdays?.length
                  ? weekdayMatches && weeksSinceStart % interval === 0
                  : daysSinceStart % interval === 0)
                : false;
    if (!matches) continue;

    for (const time of alarms) {
      const [hour, minute] = time.split(":").map(Number);
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour, minute);
      if (date > from && date <= end) occurrences.push({ date, reminderId: reminder.id });
    }
  }
  return occurrences.sort((a, b) => a.date - b.date);
}

export function getReminderInstancesForDate(reminder, dateKey) {
  if (reminder.repeat === "never" || !reminder.repeat) {
    return reminder.date === dateKey ? [reminder] : [];
  }
  if (reminder.completed) return [];
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() - 1);
  date.setHours(23, 59, 59, 999);
  const matching = getOccurrences(reminder, date, 1).filter(({ date: occurrence }) => toDateKey(occurrence) === dateKey);
  if (!matching.length) return [];
  const first = matching[0].date;
  const time = `${pad(first.getHours())}:${pad(first.getMinutes())}`;
  return [{ ...reminder, date: dateKey, time, occurrenceDate: first }];
}

export function isOverdue(reminder, now = new Date()) {
  if (reminder.completed) return false;
  if (reminder.repeat && reminder.repeat !== "never") {
    const lookback = new Date(now);
    lookback.setDate(lookback.getDate() - 400);
    lookback.setHours(0, 0, 0, 0);
    const occurrences = getOccurrences(reminder, lookback, 400);
    const upcomingToday = occurrences.some(({ date }) => date > now && toDateKey(date) === toDateKey(now));
    if (upcomingToday) return false;
    const dueOccurrences = occurrences.filter(({ date }) => date <= now);
    const lastDueOccurrence = dueOccurrences[dueOccurrences.length - 1];
    return Boolean(lastDueOccurrence && lastDueOccurrence.date < now);
  }
  const [hours, minutes] = (reminder.time || "23:59").split(":").map(Number);
  const due = fromDateKey(reminder.date);
  due.setHours(hours, minutes, 0, 0);
  return due < now;
}

export function relativeDay(date) {
  const today = toDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === today) return "Today";
  if (date === toDateKey(tomorrow)) return "Tomorrow";
  return fromDateKey(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
