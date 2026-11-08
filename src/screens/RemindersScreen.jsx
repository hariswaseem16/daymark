import { useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import ReminderRow from "../components/ReminderRow";

export default function RemindersScreen({ reminders, categories, onAdd, onComplete, onEdit, onDelete, onSnooze }) {
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => reminders.filter((reminder) => {
    const matchesStatus = filter === "all" || (filter === "open" ? !reminder.completed : reminder.completed);
    const matchesCategory = categoryFilter === "all" || reminder.categoryId === categoryFilter;
    const matchesSearch = `${reminder.title} ${reminder.description}`.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesCategory && matchesSearch;
  }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [reminders, filter, categoryFilter, search]);

  return (
    <div className="page-content">
      <div className="reminder-filters">
        <label className="search-field"><Search size={16} /><input id="reminder-search" placeholder="Find a reminder…" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="shortcut-hint">⌘ K</span></label>
        <label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Filter reminders by list" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Every list</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <button className="button button-primary" onClick={() => onAdd()}><Plus size={15} /> Add reminder</button>
      </div>
      <div className="reminder-tabs" role="tablist" aria-label="Reminder status">
        {[["all", "Everything"], ["open", "To do"], ["completed", "Done"]].map(([value, label]) => <button role="tab" aria-selected={filter === value} key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value,)}>{label}<span>{value === "all" ? reminders.length : reminders.filter((item) => value === "open" ? !item.completed : item.completed).length}</span></button>)}
      </div>
      <section className="reminder-library">
        {filtered.length ? <div className="task-list">{filtered.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} category={categories.find((category) => category.id === reminder.categoryId)} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} onSnooze={onSnooze} />)}</div>
          : <div className="library-empty"><span className="empty-icon"><Search size={18} /></span><strong>Nothing to find here.</strong><p>Try a different search or make a fresh start.</p></div>}
      </section>
    </div>
  );
}
