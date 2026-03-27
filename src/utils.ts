let counter = 0;

export function generateId(): string {
  return `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 7)}`;
}

const USER_KEY = "apostil-user";

export function loadUser(): { id: string; name: string; color: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUser(user: { id: string; name: string; color: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

const USER_COLORS = [
  "#df461c", "#2563eb", "#16a34a", "#9333ea", "#ea580c",
  "#0891b2", "#c026d3", "#4f46e5", "#059669", "#dc2626",
];

export function getRandomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}
