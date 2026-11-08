import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ReminderRow from "../components/ReminderRow";

const colors = ["#b891f5", "#70a8ee", "#f08c90", "#70c6a1", "#e7b558", "#81bdc7", "#d290b7"];

export default function ListsScreen({ reminders, categories, onAdd, onCategoryAdd, onCategoryDelete, onComplete, onEdit, onDelete, onSnooze }) {
  const [selected, setSelected] = useState(categories[0]?.id || "all");
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState("");
  const activeCategory = categories.find((category) => category.id === selected);
  const filtered = useMemo(() => reminders.filter((reminder) => selected === "all" || reminder.categoryId === selected)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [reminders, selected]);
  const addCategory = async (event) => {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    try {
      const category = { id: crypto.randomUUID(), name, color: colors[categories.length % colors.length], icon: "grid" };
      await onCategoryAdd(category);
      setSelected(category.id);
      setNewCategory("");
      setError("");
    } catch (saveError) {
      setError(saveError.message || "Could not create this list.");
    }
  };
  const deleteCategory = async () => {
    if (!activeCategory || ["personal", "work", "other"].includes(activeCategory.id)) return;
    if (!window.confirm(`Delete “${activeCategory.name}”? Its reminders will move to Personal.`)) return;
    await onCategoryDelete(activeCategory);
    setSelected("all");
  };

  return (
    <div className="page-content lists-page">
      <div className="lists-layout">
        <aside className="lists-sidebar">
          <div className="list-sidebar-heading"><span className="eyebrow">YOUR LITTLE WORLDS</span><button className="icon-button" aria-label="Create a list" onClick={() => document.getElementById("new-list-name")?.focus()}><Plus size={16} /></button></div>
          <button className={`list-nav-item ${selected === "all" ? "active" : ""}`} onClick={() => setSelected("all")}><span className="list-color-dot" style={{ background: "#a99abd" }} />All reminders<span className="list-count">{reminders.length}</span></button>
          {categories.map((category) => {
            const count = reminders.filter((reminder) => reminder.categoryId === category.id && !reminder.completed).length;
            return <button key={category.id} className={`list-nav-item ${selected === category.id ? "active" : ""}`} onClick={() => setSelected(category.id)}><span className="list-color-dot" style={{ background: category.color }} />{category.name}<span className="list-count">{count}</span></button>;
          })}
          <form className="new-list-form" onSubmit={addCategory}><input id="new-list-name" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="A new list…" maxLength={24} aria-label="New list name" /><button className="icon-button" type="submit" aria-label="Save new list"><Plus size={15} /></button></form>
          {error && <span className="form-error">{error}</span>}
        </aside>
        <section className="list-detail">
          <div className="list-detail-heading"><div><span className="list-color-dot large" style={{ background: activeCategory?.color || "#a99abd" }} /><div><p className="eyebrow">{selected === "all" ? "ALL OF IT, IN ONE PLACE" : "A SPACE OF YOUR OWN"}</p><h2>{activeCategory?.name || "All reminders"}</h2></div></div><div className="list-detail-actions">{activeCategory && !["personal", "work", "other"].includes(activeCategory.id) && <button className="icon-button danger-icon" aria-label={`Delete ${activeCategory.name} list`} title="Delete list and move its reminders to Personal" onClick={deleteCategory}><Trash2 size={16} /></button>}<button className="button button-primary" onClick={() => onAdd(undefined, activeCategory?.id)}><Plus size={15} /> Add reminder</button></div></div>
          <div className="list-summary">{filtered.filter((reminder) => !reminder.completed).length} to do <span>·</span> {filtered.filter((reminder) => reminder.completed).length} done</div>
          {filtered.length ? <div className="task-list">{filtered.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} category={categories.find((category) => category.id === reminder.categoryId)} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} onSnooze={onSnooze} />)}</div>
            : <div className="library-empty"><span className="empty-icon"><Plus size={18} /></span><strong>A fresh little corner.</strong><p>Add a reminder, or choose another list.</p></div>}
        </section>
      </div>
    </div>
  );
}
