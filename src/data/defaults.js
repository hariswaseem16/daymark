import { toDateKey } from "../utils/dates";

const today = new Date();
const atDay = (offset) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
};

export const starterCategories = [
  { id: "personal", name: "Personal", color: "#b891f5", icon: "sparkles" },
  { id: "work", name: "Work", color: "#70a8ee", icon: "briefcase" },
  { id: "health", name: "Health", color: "#f08c90", icon: "heart" },
  { id: "fitness", name: "Fitness", color: "#70c6a1", icon: "activity" },
  { id: "study", name: "Study", color: "#e7b558", icon: "book" },
  { id: "business", name: "Business", color: "#81bdc7", icon: "building" },
  { id: "other", name: "Other", color: "#aaa6bd", icon: "grid" },
];

export const starterReminders = [
  { id: "seed-1", title: "Morning pages & a little coffee", description: "Ten minutes to clear my head before the day begins.", date: atDay(0), time: "08:30", times: ["08:30"], categoryId: "personal", priority: "low", repeat: "daily", interval: 1, weekdays: [], completed: false, createdAt: new Date().toISOString() },
  { id: "seed-2", title: "Review this week’s priorities", description: "", date: atDay(0), time: "10:00", times: ["10:00"], categoryId: "work", priority: "high", repeat: "never", interval: 1, weekdays: [], completed: false, createdAt: new Date().toISOString() },
  { id: "seed-3", title: "A walk around the neighborhood", description: "Take the longer route today.", date: atDay(0), time: "12:30", times: ["12:30"], categoryId: "fitness", priority: "medium", repeat: "never", interval: 1, weekdays: [], completed: true, completedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
  { id: "seed-4", title: "Pick up something fresh for dinner", description: "", date: atDay(0), time: "17:15", times: ["17:15"], categoryId: "personal", priority: "medium", repeat: "never", interval: 1, weekdays: [], completed: false, createdAt: new Date().toISOString() },
  { id: "seed-5", title: "Send the project notes", description: "Add the notes from Tuesday’s brainstorm.", date: atDay(1), time: "09:15", times: ["09:15"], categoryId: "work", priority: "medium", repeat: "never", interval: 1, weekdays: [], completed: false, createdAt: new Date().toISOString() },
  { id: "seed-6", title: "Book a dentist appointment", description: "", date: atDay(2), time: "11:00", times: ["11:00"], categoryId: "health", priority: "low", repeat: "never", interval: 1, weekdays: [], completed: false, createdAt: new Date().toISOString() },
  { id: "seed-7", title: "Read a chapter of the new book", description: "", date: atDay(3), time: "20:00", times: ["20:00"], categoryId: "study", priority: "low", repeat: "weekly", interval: 1, weekdays: [], completed: false, createdAt: new Date().toISOString() },
];

export const defaultSettings = {
  name: "Haris",
  theme: "system",
  defaultTime: "09:00",
  weekStartsOn: 0,
  notificationsEnabled: false,
  soundEnabled: true,
  hapticsEnabled: true,
  pushServerUrl: "",
  pushVapidPublicKey: "",
  pushApiToken: "",
};
