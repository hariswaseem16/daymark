import { useState } from "react";
import { Check, Clock3, MoreHorizontal, Pencil, Repeat2, Trash2 } from "lucide-react";
import { formatTime, relativeDay } from "../utils/dates";

export default function ReminderRow({ reminder, category, onComplete, onEdit, onDelete, onSnooze, compact = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className={`reminder-row ${reminder.completed ? "is-complete" : ""} ${compact ? "is-compact" : ""}`}>
      <button
        className={`task-check ${reminder.completed ? "checked" : ""}`}
        aria-label={reminder.completed ? "Mark as not completed" : "Mark as completed"}
        onClick={() => onComplete(reminder)}
      >
        {reminder.completed && <Check size={14} strokeWidth={2.6} />}
      </button>
      <div className="task-main">
        <div className="task-title-line">
          <span className="task-title">{reminder.title}</span>
          {reminder.repeat !== "never" && <Repeat2 size={13} className="muted-icon" />}
          {reminder.priority === "high" && <span className="priority-dot" title="High priority" />}
        </div>
        {reminder.description && <p className="task-description">{reminder.description}</p>}
        <div className="task-meta">
          <span className="category-tag" style={{ "--tag-color": category?.color || "#aaa6bd" }}>
            <i />{category?.name || "Other"}
          </span>
          {reminder.times?.length > 1
            ? <span><Clock3 size={12} />{reminder.times.length} alerts</span>
            : <span><Clock3 size={12} />{formatTime(reminder.time)}</span>}
          {!compact && <span>{relativeDay(reminder.date)}</span>}
        </div>
      </div>
      <div className="task-actions">
        <button className="icon-button row-snooze" aria-label="Snooze reminder 10 minutes" onClick={() => onSnooze(reminder)}>
          <Clock3 size={15} />
        </button>
        <div className="menu-anchor">
          <button className="icon-button" aria-label="Reminder options" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <MoreHorizontal size={17} />
          </button>
          {menuOpen && (
            <div className="action-menu">
              <button onClick={() => { setMenuOpen(false); onEdit(reminder); }}><Pencil size={14} /> Edit</button>
              <button className="danger-action" onClick={() => { setMenuOpen(false); onDelete(reminder); }}><Trash2 size={14} /> Delete</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
