export function normalizeReminderForWebPush(reminder) {
  return {
    ...reminder,
    description: reminder.description || "",
    times: reminder.times?.length ? reminder.times : [reminder.time || "09:00"],
    repeat: reminder.repeat || "never",
    interval: Number(reminder.interval) || 1,
    weekdays: reminder.weekdays || [],
    completed: reminder.completed === true,
  };
}
