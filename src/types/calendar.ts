export type EventCategory =
  | "학교 행사"
  | "수업"
  | "회의"
  | "연수"
  | "제출 및 마감"
  | "학급 일정"
  | "학생 관련"
  | "학부모 관련"
  | "개인 일정"
  | "기타";

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
};

export type EventDraft = Omit<CalendarEvent, "id" | "createdAt">;
