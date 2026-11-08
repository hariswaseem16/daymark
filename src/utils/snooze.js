export function createSnoozeEntry(reminder, minutes = 10, now = new Date()) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
    throw new Error("Snooze duration must be between 1 minute and 24 hours.");
  }
  const scheduledAt = new Date(now.getTime() + minutes * 60_000);
  return {
    id: crypto.randomUUID(),
    reminderId: reminder.id,
    title: reminder.title,
    body: reminder.description || "Snoozed reminder",
    scheduledAt: scheduledAt.toISOString(),
    createdAt: now.toISOString(),
  };
}
