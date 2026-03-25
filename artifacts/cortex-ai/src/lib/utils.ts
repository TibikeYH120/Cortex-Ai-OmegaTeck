import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('hu-HU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 2) return "Most";
  if (diffMins < 60) return `${diffMins}p`;
  if (diffHours < 24) return `${diffHours}ó`;
  if (diffDays === 1) return "Tegnap";
  if (diffDays < 7) return `${diffDays} napja`;
  return new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' }).format(date);
}
