export type EventCategory = string;

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  category: EventCategory;
  memo: string;
  confidence?: "높음" | "보통" | "낮음";
  allDay?: boolean;
  completed?: boolean;
  completedAt?: string;
  createdAt?: string;
  recurrence?: "none" | "weekly" | "monthly" | "yearly";
  reminderMinutes?: number[];
  supplies?: string;
  link?: string;
};

export type EventDraft = Omit<CalendarEvent, "id" | "createdAt">;
