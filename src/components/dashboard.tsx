"use client";

import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, CalendarDays, Camera, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, FileText, Images, Menu, MessageSquareText, Plus, Search, Settings, Share2, ShieldAlert, SlidersHorizontal, Tag, Trash2, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { deleteUser, GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup, signInWithPopup, signOut } from "firebase/auth";
import { createEvent, removeAllEvents, removeEvent, subscribeToEvents, updateEvent } from "@/lib/events";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase";
import type { CalendarEvent, EventCategory, EventDraft } from "@/types/calendar";
import { Logo } from "./logo";
import { Modal } from "./modal";

const categories: EventCategory[] = ["학교 행사", "수업", "회의", "연수", "제출 및 마감", "학급 일정", "학생 관련", "학부모 관련", "개인 일정", "기타"];
const categoryPalette = ["#27a7df", "#7161d9", "#ef8f43", "#35a776", "#e55555", "#e4a61b", "#3d8ed8", "#d66aa5", "#7b869b", "#687386"];
type CategorySetting = { name: string; color: string };
type AppNotification = { id: string; title: string; body: string; createdAt: string; read: boolean };
type ToastState = { type: "success" | "info" | "warning" | "error"; title: string; message: string };
const today = new Date();
const todayKey = format(today, "yyyy-MM-dd");
const sample = (id: string, offset: number, title: string, time: string, category: EventCategory, location = ""): CalendarEvent => ({ id, title, date: format(addDays(today, offset), "yyyy-MM-dd"), startTime: time, endTime: "", location, category, memo: "" });
const samples: CalendarEvent[] = [
  sample("s1", 0, "교직원 회의", "15:00", "회의", "시청각실"), sample("s2", 0, "여름방학 안전교육 연수", "18:00", "연수", "온라인(ZOOM)"),
  sample("s3", 0, "체험학습 계획서 제출", "23:59", "제출 및 마감", "이메일 제출"), sample("s4", 1, "교실혁신 연수", "13:30", "연수", "2층 컴퓨터실"),
  sample("s5", 2, "5학년 과학 실험 수업", "09:00", "수업", "과학실"), sample("s6", 5, "여름학교 운영", "09:00", "학교 행사", "체육관"),
  sample("s7", -6, "학급회의", "10:20", "학급 일정"), sample("s8", -9, "교육계획서 마감", "18:00", "제출 및 마감"),
];
const sampleNotifications = (): AppNotification[] => {
  const now = new Date();
  return [
    { id: `demo-today-${todayKey}`, title: "예시 · 오늘의 일정 요약", body: "오늘 일정 3개 · 교직원 회의, 안전교육 연수 외 1개", createdAt: new Date(now.getTime() - 25 * 60_000).toISOString(), read: false },
    { id: `demo-deadline-${todayKey}`, title: "예시 · 마감 1시간 전", body: "체험학습 계획서 제출 · 23:59", createdAt: new Date(now.getTime() - 70 * 60_000).toISOString(), read: false },
    { id: `demo-upcoming-${todayKey}`, title: "예시 · 다가오는 일정", body: "내일 13:30 · 교실혁신 연수", createdAt: new Date(now.getTime() - 24 * 60 * 60_000).toISOString(), read: true },
  ];
};
const emptyDraft: EventDraft = { title: "", date: format(today, "yyyy-MM-dd"), startTime: "", endTime: "", location: "", category: "기타", memo: "", allDay: false, recurrence: "none", reminderMinutes: [], supplies: "", link: "" };
const defaultNotificationSettings = { enabled: false, today: true, deadline: true, urgent: true, time: "08:00" };
const defaultSchoolSettings = { defaultDeadline: "17:00", periods: ["09:00", "09:50", "10:40", "11:30", "13:10", "14:00"] };

export default function Dashboard() {
  const currentUser = isFirebaseConfigured ? getFirebaseServices().auth.currentUser : null;
  const userName = currentUser?.isAnonymous ? "체험 사용자" : currentUser?.displayName || currentUser?.email?.split("@")[0] || "선생님";
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(startOfMonth(today));
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [activeSection, setActiveSection] = useState<"calendar" | "today" | "upcoming" | "deadline" | "help">("calendar");
  const [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState<"message" | "photo" | "manual" | "review" | "categories" | "settings" | "notifications" | "help" | "deleteAll" | null>(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [candidates, setCandidates] = useState<EventDraft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [candidateReplacementIds, setCandidateReplacementIds] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null);
  const [copyTarget, setCopyTarget] = useState<CalendarEvent | null>(null);
  const [copyDate, setCopyDate] = useState(format(addDays(today, 1), "yyyy-MM-dd"));
  const [copyTitle, setCopyTitle] = useState("");
  const [copyStartTime, setCopyStartTime] = useState("");
  const [copyEndTime, setCopyEndTime] = useState("");
  const [completionPopup, setCompletionPopup] = useState<ToastState | null>(null);
  const [demoCompletedIds, setDemoCompletedIds] = useState<string[]>([]);
  const [demoOverrides, setDemoOverrides] = useState<Record<string, Partial<CalendarEvent>>>({});
  const [demoDeletedIds, setDemoDeletedIds] = useState<string[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<EventCategory[]>([...categories]);
  const [notificationSettings, setNotificationSettings] = useState(defaultNotificationSettings);
  const [categorySettings, setCategorySettings] = useState<CategorySetting[]>(categories.map((name, index) => ({ name, color: categoryPalette[index] })));
  const [newCategory, setNewCategory] = useState({ name: "", color: "#27a7df" });
  const [uiSettings, setUiSettings] = useState({ theme: "light", fontSize: "normal" });
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [schoolSettings, setSchoolSettings] = useState(defaultSchoolSettings);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [googleCalendarToken, setGoogleCalendarToken] = useState("");
  const [googleCalendarAccount, setGoogleCalendarAccount] = useState("");
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState<"connect" | "export" | null>(null);

  useEffect(() => { let stop: () => void = () => undefined; subscribeToEvents(setEvents).then((unsubscribe) => { stop = unsubscribe; }).catch(() => undefined); return () => stop(); }, []);
  useEffect(() => {
    const savedCategories = localStorage.getItem("t-calendar-visible-categories");
    const savedNotifications = localStorage.getItem("t-calendar-notifications");
    const savedCategorySettings = localStorage.getItem("t-calendar-categories");
    const savedUi = localStorage.getItem("t-calendar-ui");
    const savedAppNotifications = localStorage.getItem("t-calendar-notification-history");
    const savedDemoCompleted = localStorage.getItem("t-calendar-demo-completed");
    const savedDemoOverrides = localStorage.getItem("t-calendar-demo-overrides");
    const savedDemoDeleted = localStorage.getItem("t-calendar-demo-deleted");
    const savedSchoolSettings = localStorage.getItem("t-calendar-school-settings");
    if (savedCategories) setVisibleCategories(JSON.parse(savedCategories));
    if (savedNotifications) setNotificationSettings({ ...defaultNotificationSettings, ...JSON.parse(savedNotifications) });
    if (savedCategorySettings) setCategorySettings(JSON.parse(savedCategorySettings));
    if (savedUi) {
      const parsed = JSON.parse(savedUi);
      setUiSettings({ ...parsed, theme: parsed.theme === "dark" ? "dark" : "light" });
    }
    if (savedAppNotifications) {
      const parsed = JSON.parse(savedAppNotifications);
      const demos = sampleNotifications();
      const initial = currentUser?.isAnonymous ? [...demos.filter((demo) => !parsed.some((notification: AppNotification) => notification.id === demo.id)), ...parsed] : parsed;
      setAppNotifications(initial);
      if (currentUser?.isAnonymous) localStorage.setItem("t-calendar-notification-history", JSON.stringify(initial));
    } else if (currentUser?.isAnonymous) {
      const initial = sampleNotifications();
      setAppNotifications(initial);
      localStorage.setItem("t-calendar-notification-history", JSON.stringify(initial));
    }
    if (savedDemoCompleted) setDemoCompletedIds(JSON.parse(savedDemoCompleted));
    if (savedDemoOverrides) setDemoOverrides(JSON.parse(savedDemoOverrides));
    if (savedDemoDeleted) setDemoDeletedIds(JSON.parse(savedDemoDeleted));
    if (savedSchoolSettings) setSchoolSettings({ ...defaultSchoolSettings, ...JSON.parse(savedSchoolSettings) });
  }, []);
  const demoEvents = samples
    .filter((event) => !demoDeletedIds.includes(event.id))
    .map((event) => ({ ...event, ...demoOverrides[event.id], ...(demoCompletedIds.includes(event.id) ? { completed: true, completedAt: new Date().toISOString() } : {}) }));
  const visibleEvents = currentUser?.isAnonymous ? [...demoEvents, ...events] : isFirebaseConfigured ? events : demoEvents;
  const calendarEvents = visibleEvents.filter((event) => visibleCategories.includes(event.category));
  const todayEvents = calendarEvents.filter((event) => isSameDay(parseISO(event.date), today));
  const allUpcoming = calendarEvents.filter((event) => event.date > todayKey && !event.completed).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const upcoming = allUpcoming.slice(0, 4);
  const pastEvents = calendarEvents.filter((event) => event.date < todayKey && !event.completed).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const completedEvents = calendarEvents.filter((event) => event.completed).sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));
  const unreadNotificationCount = appNotifications.filter((notification) => !notification.read).length;
  const searchResults = useMemo(() => {
    const normalized = normalizeEventText(searchQuery);
    if (!normalized) return [];
    const wantsIncomplete = /미완료|완료하지않은/.test(normalized);
    const wantsThisMonth = normalized.includes("이번달");
    const query = normalized.replace(/미완료|완료하지않은|이번달/g, "");
    return visibleEvents
      .filter((event) => (!wantsIncomplete || !event.completed) && (!wantsThisMonth || event.date.startsWith(format(today, "yyyy-MM"))) && (!query || normalizeEventText(`${event.title} ${event.category} ${event.location} ${event.memo} ${event.date}`).includes(query)))
      .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime))
      .slice(0, 8);
  }, [searchQuery, visibleEvents]);
  useEffect(() => {
    if (!notificationSettings.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const notify = () => {
      const now = new Date();
      if (format(now, "HH:mm") !== notificationSettings.time) return;
      const notificationKey = `t-calendar-notified-${format(now, "yyyy-MM-dd")}-${notificationSettings.time}`;
      if (localStorage.getItem(notificationKey)) return;
      const messages: string[] = [];
      if (notificationSettings.today && todayEvents.length) messages.push(`오늘 일정 ${todayEvents.length}개`);
      if (notificationSettings.deadline && pastEvents.length) messages.push(`미완료 마감 ${pastEvents.length}개`);
      if (!messages.length) return;
      const body = messages.join(" · ");
      new Notification("T-Calendar 일정 알림", { body });
      addAppNotification(notificationKey, "오늘의 일정 요약", body);
      localStorage.setItem(notificationKey, "sent");
    };
    notify();
    const timer = window.setInterval(notify, 30_000);
    return () => window.clearInterval(timer);
  }, [notificationSettings, todayEvents, pastEvents]);
  useEffect(() => {
    document.documentElement.dataset.theme = uiSettings.theme;
    document.documentElement.dataset.fontSize = uiSettings.fontSize;
    localStorage.setItem("t-calendar-ui", JSON.stringify(uiSettings));
  }, [uiSettings]);
  useEffect(() => {
    if (!notificationOpen) return;
    const close = (event: PointerEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationOpen]);
  useEffect(() => {
    if (!searchOpen) return;
    const close = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [searchOpen]);
  useEffect(() => {
    if (!notificationSettings.enabled || !notificationSettings.urgent || !("Notification" in window) || Notification.permission !== "granted") return;
    const notifyUrgent = () => {
      const now = Date.now();
      visibleEvents.filter((event) => !event.completed && isTaskEvent(event) && event.date && event.startTime).forEach((event) => {
        const minutesLeft = (new Date(`${event.date}T${event.startTime}`).getTime() - now) / 60_000;
        const key = `t-calendar-urgent-${event.id}`;
        if (minutesLeft > 59 && minutesLeft <= 60 && !localStorage.getItem(key)) {
          const body = `${event.title} · ${event.startTime}`;
          new Notification("마감 1시간 전", { body });
          addAppNotification(key, "마감 1시간 전", body);
          localStorage.setItem(key, "sent");
        }
      });
    };
    notifyUrgent();
    const timer = window.setInterval(notifyUrgent, 30_000);
    return () => window.clearInterval(timer);
  }, [notificationSettings, visibleEvents]);
  useEffect(() => {
    if (!notificationSettings.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const notifyEventReminders = () => {
      const now = Date.now();
      visibleEvents.filter((event) => !event.completed && event.date && event.startTime && event.reminderMinutes?.length).forEach((event) => {
        const startsAt = new Date(`${event.date}T${event.startTime}`).getTime();
        event.reminderMinutes?.forEach((minutes) => {
          const minutesLeft = (startsAt - now) / 60_000;
          const key = `t-calendar-event-reminder-${event.id}-${minutes}`;
          if (minutesLeft <= minutes && minutesLeft > minutes - 0.6 && !localStorage.getItem(key)) {
            const label = minutes >= 1440 ? `${minutes / 1440}일 전` : minutes >= 60 ? `${minutes / 60}시간 전` : `${minutes}분 전`;
            const body = `${event.title} · ${event.startTime} · ${label}`;
            new Notification("일정 알림", { body });
            addAppNotification(key, `일정 ${label}`, body);
            localStorage.setItem(key, "sent");
          }
        });
      });
    };
    notifyEventReminders();
    const timer = window.setInterval(notifyEventReminders, 30_000);
    return () => window.clearInterval(timer);
  }, [notificationSettings, visibleEvents]);

  async function analyze(payload: { text?: string; image?: string; mimeType?: string; files?: { data: string; mimeType: string }[] }) {
    if (payload.text && /(?:\d{6}\s*-\s*\d{7}|01[016789][-\s]?\d{3,4}[-\s]?\d{4}|주민등록번호|건강|상담\s*내용)/.test(payload.text)) {
      const proceed = window.confirm("민감한 개인정보가 포함되어 있을 수 있습니다. 원문은 저장하지 않지만 AI 분석을 위해 전송됩니다. 계속할까요?");
      if (!proceed) return;
    }
    setLoading(true); setAnalyzing(true); setNotice("");
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, schoolSettings }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const uniqueEvents = deduplicateExtractedEvents(data.events);
      const newEvents = uniqueEvents.filter((event) => !visibleEvents.some((saved) => eventsOverlap(event, saved)));
      const replacements: Record<number, string> = {};
      newEvents.forEach((candidate, index) => {
        const similar = visibleEvents.find((event) => !event.id.startsWith("s") && normalizeEventText(event.title) === normalizeEventText(candidate.title) && event.date !== candidate.date);
        if (similar && window.confirm(`기존 ‘${similar.title}’ 일정(${similar.date} ${similar.startTime || ""})과 이름이 같습니다.\n확인을 누르면 기존 일정을 ${candidate.date} ${candidate.startTime || ""}(으)로 변경하고, 취소를 누르면 새 일정으로 추가합니다.`)) replacements[index] = similar.id;
      });
      setCandidates(newEvents);
      setSelected(newEvents.map((_: EventDraft, index: number) => index));
      setCandidateReplacementIds(replacements);
      setModal("review");
    } catch (error) { setNotice(error instanceof Error ? error.message : "일정을 분석하지 못했습니다."); } finally { setLoading(false); setAnalyzing(false); }
  }
  async function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    if (files.length > 10) return setNotice("사진은 한 번에 최대 10장까지 선택할 수 있습니다.");
    if (files.some((file) => file.size > 10 * 1024 * 1024)) return setNotice("각 사진은 10MB 이하로 선택해 주세요.");
    if (files.some((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) return setNotice("PNG, JPG, WEBP 사진만 업로드할 수 있습니다.");
    setNotice(`${files.length}장의 사진을 읽고 있습니다...`);
    try {
      const prepared = await Promise.all(files.map(prepareImage));
      await analyze({ files: prepared.map(({ image, mimeType }) => ({ data: image, mimeType })) });
    } catch {
      setNotice("사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
    }
  }
  async function handlePdf(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") return setNotice("PDF 파일만 업로드할 수 있습니다.");
    if (file.size > 20 * 1024 * 1024) return setNotice("PDF는 20MB 이하로 선택해 주세요.");
    setNotice("PDF에서 일정을 찾고 있습니다...");
    try {
      const source = await readAsDataUrl(file);
      await analyze({ files: [{ data: source.split(",")[1], mimeType: "application/pdf" }] });
    } catch {
      setNotice("PDF를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.");
    }
  }
  async function createRecurrenceCopies(source: EventDraft) {
    if (!source.recurrence || source.recurrence === "none") return 0;
    const base = parseISO(source.date);
    const count = source.recurrence === "weekly" ? 51 : source.recurrence === "monthly" ? 11 : 3;
    const dates = Array.from({ length: count }, (_, index) => {
      const step = index + 1;
      const next = source.recurrence === "weekly" ? addWeeks(base, step) : source.recurrence === "monthly" ? addMonths(base, step) : addYears(base, step);
      return format(next, "yyyy-MM-dd");
    });
    await Promise.all(dates.map((date) => createEvent({ ...source, date, recurrence: "none" })));
    return dates.length;
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault(); setLoading(true);
    try { await createEvent(draft); const copies = await createRecurrenceCopies(draft); setModal(null); setDraft(emptyDraft); setNotice(copies ? `일정과 반복 일정 ${copies}개를 저장했습니다.` : "일정을 저장했습니다."); } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setLoading(false); }
  }
  async function saveCandidates() {
    const items = selected.map((index) => ({ index, event: candidates[index] })).filter((item) => item.event);
    if (!items.length) return setNotice("새로 추가하거나 변경할 일정이 없습니다.");
    setModal(null); setLoading(true); setMessage(""); setCandidates([]); setSelected([]);
    try {
      let savedCount = 0;
      await Promise.all(items.map(async ({ index, event }) => {
        const replacementId = candidateReplacementIds[index];
        if (replacementId && !replacementId.startsWith("s")) {
          await updateEvent(replacementId, event); savedCount += 1;
        } else if (!visibleEvents.some((saved) => eventsOverlap(event, saved))) {
          await createEvent(event); savedCount += 1;
        }
      }));
      setCandidateReplacementIds({});
      setNotice(`${savedCount}개 일정을 저장하거나 변경했습니다.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setLoading(false); }
  }
  function updateCandidate(index: number, key: keyof EventDraft, value: string) {
    setCandidates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, [key]: value } : candidate));
  }
  function removeCandidate(index: number) {
    setCandidates((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
    setSelected((current) => current.filter((item) => item !== index).map((item) => item > index ? item - 1 : item));
    setCandidateReplacementIds({});
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editTarget) return;
    setLoading(true);
    try {
      if (editTarget.id.startsWith("s")) {
        const next = { ...demoOverrides, [editTarget.id]: { ...draft } };
        setDemoOverrides(next);
        localStorage.setItem("t-calendar-demo-overrides", JSON.stringify(next));
      } else {
        await updateEvent(editTarget.id, draft);
        if ((!editTarget.recurrence || editTarget.recurrence === "none") && draft.recurrence && draft.recurrence !== "none") await createRecurrenceCopies(draft);
      }
      setEditTarget(null); setSelectedEvent(null); setNotice("일정을 수정했습니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "수정하지 못했습니다."); } finally { setLoading(false); }
  }
  async function deleteSingleEvent(target: CalendarEvent) {
    if (target.id.startsWith("s")) {
      const next = [...new Set([...demoDeletedIds, target.id])];
      setDemoDeletedIds(next);
      localStorage.setItem("t-calendar-demo-deleted", JSON.stringify(next));
    } else if (isFirebaseConfigured) await removeEvent(target.id);
    setDeleteTarget(null);
    setCompletionPopup({ type: "info", title: "일정 삭제", message: `‘${target.title}’ 일정을 삭제했습니다.` });
    window.setTimeout(() => setCompletionPopup(null), 3000);
  }
  function openToday() { setActiveSection("today"); setSidebar(false); }
  function openCalendar() { setActiveSection("calendar"); setSidebar(false); }
  function openUpcoming() { setActiveSection("upcoming"); setSidebar(false); }
  function openDeadline() { setActiveSection("deadline"); setSidebar(false); }
  function openHelp() { setActiveSection("help"); setSidebar(false); }
  function changeCalendarView(nextView: "month" | "week") {
    if (nextView === calendarView) return;
    setMonth((current) => nextView === "week"
      ? startOfWeek(current)
      : startOfMonth(addDays(startOfWeek(current), 3)));
    setCalendarView(nextView);
  }
  async function toggleCompleted(event: CalendarEvent) {
    const completed = !event.completed;
    if (event.id.startsWith("s")) {
      const next = completed ? [...new Set([...demoCompletedIds, event.id])] : demoCompletedIds.filter((id) => id !== event.id);
      setDemoCompletedIds(next);
      localStorage.setItem("t-calendar-demo-completed", JSON.stringify(next));
      setSelectedEvent(null);
      if (completed) {
        setCompletionPopup({ type: "success", title: "작업 완료", message: `‘${event.title}’ 일정이 완료되었습니다.` });
        window.setTimeout(() => setCompletionPopup(null), 3000);
      } else {
        setCompletionPopup({ type: "info", title: "상태 변경", message: `‘${event.title}’ 일정을 미완료 상태로 되돌렸습니다.` });
        window.setTimeout(() => setCompletionPopup(null), 3000);
      }
      return;
    }
    if (!isFirebaseConfigured) return setNotice("Firebase 연결 후 완료 상태를 변경할 수 있습니다.");
    setLoading(true);
    try {
      await updateEvent(event.id, { completed, completedAt: completed ? new Date().toISOString() : "" });
      setSelectedEvent(null);
      if (completed) {
        setCompletionPopup({ type: "success", title: "작업 완료", message: `‘${event.title}’ 일정이 완료되었습니다.` });
        window.setTimeout(() => setCompletionPopup(null), 3000);
      } else {
        setCompletionPopup({ type: "info", title: "상태 변경", message: `‘${event.title}’ 일정을 미완료 상태로 되돌렸습니다.` });
        window.setTimeout(() => setCompletionPopup(null), 3000);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "완료 상태를 변경하지 못했습니다."); } finally { setLoading(false); }
  }
  async function saveCopy(event: FormEvent) {
    event.preventDefault();
    if (!copyTarget) return;
    setLoading(true);
    try {
      await createEvent({ ...toDraft(copyTarget), title: copyTitle.trim(), date: copyDate, startTime: copyStartTime, endTime: copyEndTime, completed: false, completedAt: "" });
      setCopyTarget(null);
      setNotice(`‘${copyTarget.title}’ 일정을 ${copyDate}에 복사했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "일정을 복사하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  function toggleCategory(category: EventCategory) {
    setVisibleCategories((current) => {
      const next = current.includes(category) ? current.filter((item) => item !== category) : [...current, category];
      localStorage.setItem("t-calendar-visible-categories", JSON.stringify(next));
      return next;
    });
  }
  async function enableNotifications(enabled: boolean) {
    if (enabled && "Notification" in window && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setNotice("브라우저에서 알림 권한을 허용해 주세요.");
    }
    const next = { ...notificationSettings, enabled };
    setNotificationSettings(next);
    localStorage.setItem("t-calendar-notifications", JSON.stringify(next));
  }
  function updateNotificationSetting(key: "today" | "deadline" | "urgent" | "time", value: boolean | string) {
    const next = { ...notificationSettings, [key]: value };
    setNotificationSettings(next);
    localStorage.setItem("t-calendar-notifications", JSON.stringify(next));
  }
  function updateSchoolSettings(next: typeof defaultSchoolSettings) {
    setSchoolSettings(next);
    localStorage.setItem("t-calendar-school-settings", JSON.stringify(next));
  }
  function addAppNotification(id: string, title: string, body: string) {
    setAppNotifications((current) => {
      if (current.some((notification) => notification.id === id)) return current;
      const next = [{ id, title, body, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 100);
      localStorage.setItem("t-calendar-notification-history", JSON.stringify(next));
      return next;
    });
  }
  function markNotificationRead(id: string) {
    setAppNotifications((current) => {
      const next = current.map((notification) => notification.id === id ? { ...notification, read: true } : notification);
      localStorage.setItem("t-calendar-notification-history", JSON.stringify(next));
      return next;
    });
  }
  function markAllNotificationsRead() {
    setAppNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, read: true }));
      localStorage.setItem("t-calendar-notification-history", JSON.stringify(next));
      return next;
    });
  }
  function addCategory() {
    const name = newCategory.name.trim();
    if (!name) return setNotice("추가할 분류 이름을 입력해 주세요.");
    if (categorySettings.some((category) => category.name === name)) return setNotice("이미 같은 이름의 분류가 있습니다.");
    const next = [...categorySettings, { name, color: newCategory.color }];
    const nextVisible = [...visibleCategories, name];
    setCategorySettings(next); setVisibleCategories(nextVisible);
    localStorage.setItem("t-calendar-categories", JSON.stringify(next));
    localStorage.setItem("t-calendar-visible-categories", JSON.stringify(nextVisible));
    setNewCategory({ name: "", color: "#27a7df" });
  }
  async function deleteCategory(name: string) {
    if (name === "기타") return setNotice("'기타' 분류는 삭제할 수 없습니다.");
    const affected = events.filter((event) => event.category === name);
    if (isFirebaseConfigured && affected.length) await Promise.all(affected.map((event) => updateEvent(event.id, { category: "기타" })));
    const next = categorySettings.filter((category) => category.name !== name);
    setCategorySettings(next);
    setVisibleCategories((current) => {
      const nextVisible = current.filter((category) => category !== name);
      localStorage.setItem("t-calendar-visible-categories", JSON.stringify(nextVisible));
      return nextVisible;
    });
    localStorage.setItem("t-calendar-categories", JSON.stringify(next));
  }
  function updateCategoryColor(name: string, color: string) {
    const next = categorySettings.map((category) => category.name === name ? { ...category, color } : category);
    setCategorySettings(next);
    localStorage.setItem("t-calendar-categories", JSON.stringify(next));
  }
  async function deleteAll() {
    if (!isFirebaseConfigured) return setNotice("체험 일정은 삭제할 수 없습니다.");
    setLoading(true);
    try {
      const count = await removeAllEvents();
      setModal(null);
      setNotice(`${count}개의 일정을 모두 삭제했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "전체 일정을 삭제하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  function exportCalendar() {
    const escape = (value = "") => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const dateTime = (date: string, time: string) => `${date.replace(/-/g, "")}T${(time || "00:00").replace(":", "")}00`;
    const rows = visibleEvents.map((event) => {
      const start = event.allDay ? `DTSTART;VALUE=DATE:${event.date.replace(/-/g, "")}` : `DTSTART:${dateTime(event.date, event.startTime)}`;
      const end = event.allDay ? `DTEND;VALUE=DATE:${format(addDays(parseISO(event.date), 1), "yyyyMMdd")}` : event.endTime ? `DTEND:${dateTime(event.date, event.endTime)}` : "";
      return ["BEGIN:VEVENT", `UID:${event.id}@t-calendar`, `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss")}`, start, end, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(event.location)}`, `DESCRIPTION:${escape([event.memo, event.supplies ? `준비물: ${event.supplies}` : "", event.link || ""].filter(Boolean).join("\n"))}`, "END:VEVENT"].filter(Boolean).join("\r\n");
    });
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//T-Calendar//KO", "CALSCALE:GREGORIAN", ...rows, "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `t-calendar-${todayKey}.ics`; anchor.click();
    URL.revokeObjectURL(url);
    setCompletionPopup({ type: "success", title: "내보내기 완료", message: `${visibleEvents.length}개 일정을 ICS 파일로 저장했습니다.` });
    window.setTimeout(() => setCompletionPopup(null), 3000);
  }
  async function shareToKakaoTalk() {
    if (!visibleEvents.length) {
      setCompletionPopup({ type: "warning", title: "공유할 일정 없음", message: "현재 화면에 표시된 일정이 없습니다." });
      window.setTimeout(() => setCompletionPopup(null), 3000);
      return;
    }

    const sortedEvents = [...visibleEvents].sort((a, b) =>
      `${a.date} ${a.startTime || "00:00"}`.localeCompare(`${b.date} ${b.startTime || "00:00"}`)
    );
    const eventLines = sortedEvents.map((event) => {
      const date = format(parseISO(event.date), "M월 d일 (EEE)", { locale: ko });
      const time = event.allDay ? "하루 종일" : [event.startTime, event.endTime].filter(Boolean).join("~") || "시간 미정";
      const details = [event.location && `장소: ${event.location}`, event.memo && `메모: ${event.memo}`].filter(Boolean);
      return `• ${date} ${time}\n  ${event.completed ? "[완료] " : ""}${event.title}${details.length ? `\n  ${details.join(" · ")}` : ""}`;
    });
    const shareText = [`T-Calendar 일정 ${sortedEvents.length}개`, "", ...eventLines].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "T-Calendar 일정", text: shareText });
        setCompletionPopup({ type: "success", title: "공유 완료", message: "선택한 앱으로 일정 내용을 공유했습니다." });
      } else {
        await copyShareText(shareText);
        setCompletionPopup({ type: "info", title: "일정 복사 완료", message: "카카오톡 대화방에 붙여넣어 공유해 주세요." });
      }
      window.setTimeout(() => setCompletionPopup(null), 3000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyShareText(shareText);
        setCompletionPopup({ type: "info", title: "일정 복사 완료", message: "공유창을 열 수 없어 내용을 복사했습니다. 카카오톡에 붙여넣어 주세요." });
      } catch {
        setCompletionPopup({ type: "error", title: "공유 실패", message: "일정을 공유하지 못했습니다. 잠시 후 다시 시도해 주세요." });
      }
      window.setTimeout(() => setCompletionPopup(null), 4000);
    }
  }
  async function copyShareText(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy failed");
  }
  async function connectGoogleCalendar() {
    if (!isFirebaseConfigured) {
      setCompletionPopup({ type: "error", title: "연결할 수 없음", message: "Firebase 인증 설정을 먼저 완료해 주세요." });
      window.setTimeout(() => setCompletionPopup(null), 4000);
      return;
    }
    setGoogleCalendarLoading("connect");
    try {
      const { auth } = getFirebaseServices();
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/calendar.events");
      provider.setCustomParameters({ prompt: "consent" });

      const user = auth.currentUser;
      const hasGoogleProvider = user?.providerData.some((profile) => profile.providerId === GoogleAuthProvider.PROVIDER_ID);
      const result = !user
        ? await signInWithPopup(auth, provider)
        : hasGoogleProvider
          ? await reauthenticateWithPopup(user, provider)
          : await linkWithPopup(user, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) throw new Error("Google Calendar 접근 권한을 받지 못했습니다.");

      setGoogleCalendarToken(credential.accessToken);
      setGoogleCalendarAccount(result.user.email || "Google 계정");
      setCompletionPopup({ type: "success", title: "Google Calendar 연결 완료", message: `${result.user.email || "Google 계정"}과 연결했습니다.` });
      window.setTimeout(() => setCompletionPopup(null), 3000);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      const message = code === "auth/credential-already-in-use" || code === "auth/account-exists-with-different-credential"
        ? "이 Google 계정은 다른 T-Calendar 계정에서 사용 중입니다."
        : error instanceof Error ? error.message : "Google Calendar 연결에 실패했습니다.";
      setCompletionPopup({ type: "error", title: "Google 연결 실패", message });
      window.setTimeout(() => setCompletionPopup(null), 5000);
    } finally {
      setGoogleCalendarLoading(null);
    }
  }
  async function exportToGoogleCalendar() {
    if (!googleCalendarToken) {
      await connectGoogleCalendar();
      return;
    }
    if (!visibleEvents.length) {
      setCompletionPopup({ type: "warning", title: "내보낼 일정 없음", message: "현재 화면에 표시된 일정이 없습니다." });
      window.setTimeout(() => setCompletionPopup(null), 3000);
      return;
    }

    setGoogleCalendarLoading("export");
    let added = 0;
    let skipped = 0;
    try {
      for (const event of visibleEvents) {
        const marker = encodeURIComponent(`tCalendarId=${event.id}`);
        const duplicateResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&privateExtendedProperty=${marker}`, {
          headers: { Authorization: `Bearer ${googleCalendarToken}` },
        });
        if (!duplicateResponse.ok) throw await googleCalendarError(duplicateResponse);
        const duplicateResult = await duplicateResponse.json() as { items?: unknown[] };
        if (duplicateResult.items?.length) {
          skipped += 1;
          continue;
        }

        const startDate = new Date(`${event.date}T${event.startTime || "09:00"}:00+09:00`);
        const endDate = event.endTime
          ? new Date(`${event.date}T${event.endTime}:00+09:00`)
          : new Date(startDate.getTime() + 60 * 60_000);
        const requestBody = {
          summary: event.title,
          location: event.location || undefined,
          description: [
            event.memo,
            event.supplies ? `준비물: ${event.supplies}` : "",
            event.link || "",
            event.completed ? "T-Calendar에서 완료된 일정" : "",
          ].filter(Boolean).join("\n") || undefined,
          start: event.allDay ? { date: event.date } : { dateTime: startDate.toISOString(), timeZone: "Asia/Seoul" },
          end: event.allDay
            ? { date: format(addDays(parseISO(event.date), 1), "yyyy-MM-dd") }
            : { dateTime: endDate.toISOString(), timeZone: "Asia/Seoul" },
          extendedProperties: { private: { tCalendarId: event.id, source: "t-calendar" } },
        };
        const createResponse = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleCalendarToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });
        if (!createResponse.ok) throw await googleCalendarError(createResponse);
        added += 1;
      }
      setCompletionPopup({
        type: "success",
        title: "Google Calendar 내보내기 완료",
        message: `${added}개를 추가했습니다.${skipped ? ` 이미 내보낸 ${skipped}개는 제외했습니다.` : ""}`,
      });
      window.setTimeout(() => setCompletionPopup(null), 4000);
    } catch (error) {
      const unauthorized = error instanceof Error && error.message === "GOOGLE_AUTH_EXPIRED";
      if (unauthorized) {
        setGoogleCalendarToken("");
        setGoogleCalendarAccount("");
      }
      setCompletionPopup({
        type: "error",
        title: "Google Calendar 내보내기 실패",
        message: unauthorized ? "Google 연결이 만료되었습니다. 다시 연결해 주세요." : error instanceof Error ? error.message : "일정을 내보내지 못했습니다.",
      });
      window.setTimeout(() => setCompletionPopup(null), 5000);
    } finally {
      setGoogleCalendarLoading(null);
    }
  }
  async function googleCalendarError(response: Response) {
    if (response.status === 401) return new Error("GOOGLE_AUTH_EXPIRED");
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (response.status === 403) return new Error("Google Calendar API 사용 설정과 캘린더 권한을 확인해 주세요.");
    return new Error(result?.error?.message || "Google Calendar 요청에 실패했습니다.");
  }
  async function deleteAccountAndData() {
    if (!currentUser || !window.confirm("계정과 모든 일정 데이터를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    setLoading(true);
    try {
      if (isFirebaseConfigured) await removeAllEvents();
      Object.keys(localStorage).filter((key) => key.startsWith("t-calendar-")).forEach((key) => localStorage.removeItem(key));
      await deleteUser(currentUser);
    } catch (error) {
      setCompletionPopup({ type: "error", title: "삭제 실패", message: error instanceof Error ? error.message : "계정 데이터를 삭제하지 못했습니다. 다시 로그인한 후 시도해 주세요." });
      window.setTimeout(() => setCompletionPopup(null), 5000);
    } finally {
      setLoading(false);
    }
  }

  categories.splice(0, categories.length, ...categorySettings.map((category) => category.name));
  return <div className="app-shell">
    <style>{categorySettings.map((category, index) => `.c-${index}{color:${category.color}!important;background:color-mix(in srgb,${category.color} 11%,white)!important}`).join("")}</style>
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="sidebar-top"><button className="sidebar-logo-button" onClick={openCalendar} aria-label="캘린더 홈으로 이동"><Logo /></button><span>교사를 위한 스마트 캘린더</span><button className="mobile-close" onClick={() => setSidebar(false)} aria-label="메뉴 닫기"><X /></button></div>
      <nav aria-label="주요 메뉴">
        <button className={`nav-item ${activeSection === "calendar" ? "active" : ""}`} onClick={openCalendar}><CalendarDays />캘린더</button><button className={`nav-item ${activeSection === "today" ? "active" : ""}`} onClick={openToday}><CalendarDays />오늘의 일정</button><button className={`nav-item ${activeSection === "upcoming" ? "active" : ""}`} onClick={openUpcoming}><CalendarDays />다가오는 일정</button>
        <button className={`nav-item ${activeSection === "deadline" ? "active" : ""}`} onClick={openDeadline}><CalendarDays />마감 일정 {pastEvents.length > 0 && <b className="nav-count">{pastEvents.length}</b>}</button><div className="nav-divider" />
        <button className="nav-item" onClick={() => setModal("message")}><MessageSquareText />메시지로 추가하기</button><button className="nav-item" onClick={() => setModal("photo")}><Images />사진으로 추가하기</button><button className="nav-item" onClick={() => setModal("manual")}><Plus />직접 추가하기</button><div className="nav-divider" />
        <button className="nav-item" onClick={() => { setModal("categories"); setSidebar(false); }}><Tag />분류 관리</button><div className="nav-divider" /><button className="nav-item" onClick={() => { setModal("settings"); setSidebar(false); }}><Settings />설정</button><button className={`nav-item ${activeSection === "help" ? "active" : ""}`} onClick={openHelp}><CircleHelp />도움말</button>
      </nav>
      <div className="tip-card"><strong>T-Calendar 꿀팁!</strong><p><b>메시지·사진·PDF</b>만 있으면 AI가 일정을 자동으로 찾아드려요.</p><span>🐿️</span></div>
    </aside>
    {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="메뉴 닫기" />}
    <main>
      <header className="topbar"><button className="menu-button" onClick={() => setSidebar(true)} aria-label="메뉴 열기"><Menu /></button><button className="mobile-logo" onClick={openCalendar} aria-label="캘린더 홈으로 이동"><Logo /></button>
        <div className="search-area" ref={searchRef}><label className="search-box"><input value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} placeholder="일정 검색 (예: 회의, 연수, 마감)" aria-label="일정 검색" /><Search /></label>{searchOpen && searchQuery.trim() && <section className="search-results"><header><strong>검색 결과</strong><span>{searchResults.length}개</span></header>{searchResults.length ? <div>{searchResults.map((event) => <button key={event.id} onClick={() => { setSelectedEvent(event); setSearchOpen(false); }}><span className={`search-category c-${categories.indexOf(event.category)}`}>{shortCategory(event.category)}</span><div><strong>{event.title}</strong><small>{format(parseISO(event.date), "yyyy.MM.dd (EEE)", { locale: ko })} · {event.startTime || "종일"}{event.location ? ` · ${event.location}` : ""}</small></div><ChevronRight /></button>)}</div> : <div className="search-empty"><Search /><strong>일정을 찾지 못했습니다.</strong><span>제목, 분류, 장소 또는 날짜로 다시 검색해 보세요.</span></div>}</section>}</div>
        <div className="top-actions"><div className="notification-anchor" ref={notificationRef}><button className="icon-button alarm" aria-label={`알림 ${unreadNotificationCount}개`} aria-expanded={notificationOpen} onClick={() => setNotificationOpen((open) => !open)}><Bell />{unreadNotificationCount > 0 && <i>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</i>}</button>{notificationOpen && <section className="notification-dropdown"><header><div><strong>알림</strong><span>읽지 않음 {unreadNotificationCount}개</span></div>{unreadNotificationCount > 0 && <button onClick={markAllNotificationsRead}>모두 읽음</button>}</header><div className="notification-dropdown-list">{appNotifications.length ? appNotifications.slice(0, 6).map((notification) => <button className={notification.read ? "is-read" : "is-unread"} key={notification.id} onClick={() => markNotificationRead(notification.id)}><i /><div><strong>{notification.title}</strong><p>{notification.body}</p><time>{format(parseISO(notification.createdAt), "M월 d일 HH:mm", { locale: ko })}</time></div></button>) : <div className="notification-dropdown-empty"><Bell /><strong>새 알림이 없습니다.</strong><span>받은 일정 알림이 이곳에 표시됩니다.</span></div>}</div><footer><button onClick={() => { setNotificationOpen(false); setModal("settings"); }}><Settings /> 알림 설정</button></footer></section>}</div><button className="icon-button" aria-label="도움말" onClick={openHelp}><CircleHelp /></button><button className="user-menu-button" onClick={() => currentUser && signOut(getFirebaseServices().auth)} title="로그아웃"><span className="user-avatar">{currentUser?.isAnonymous ? "👋" : "👩🏻"}</span><strong>{userName}</strong><ChevronDown /></button></div>
      </header>
      <div className="content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}><X /></button></div>}
        {activeSection === "calendar" ? <div className="workspace">
          <div className="calendar-column">
            <section className="calendar-card">
            <div className="calendar-toolbar"><div className="month-nav"><h1>{calendarView === "month" ? format(month, "yyyy년 M월") : `${format(startOfWeek(month), "M월 d일")} – ${format(endOfWeek(month), "M월 d일")}`}</h1><button onClick={() => setMonth((date) => calendarView === "month" ? subMonths(date, 1) : subWeeks(date, 1))}><ChevronLeft /></button><button onClick={() => setMonth((date) => calendarView === "month" ? addMonths(date, 1) : addWeeks(date, 1))}><ChevronRight /></button><button onClick={() => setMonth(calendarView === "month" ? startOfMonth(today) : startOfWeek(today))}>오늘</button></div>
              <div className="view-tools"><div className="view-switch"><button className={calendarView === "month" ? "active" : ""} onClick={() => changeCalendarView("month")}>월간</button><button className={calendarView === "week" ? "active" : ""} onClick={() => changeCalendarView("week")}>주간</button></div><button className="filter-button" onClick={() => setModal("categories")}><SlidersHorizontal />필터</button><button className="export-button" onClick={shareToKakaoTalk} title="기본 공유창에서 카카오톡을 선택하세요"><Share2 />카카오톡으로 내보내기</button>{calendarView === "week" && <button className="delete-all-button" onClick={() => setModal("deleteAll")}><Trash2 />전체 삭제</button>}</div></div>
            {calendarView === "month"
              ? <MonthCalendar month={month} events={calendarEvents} onAdd={(date) => { setDraft({ ...emptyDraft, date }); setModal("manual"); }} onSelect={setSelectedEvent} />
              : <WeekCalendar week={month} events={calendarEvents} onAdd={(date) => { setDraft({ ...emptyDraft, date }); setModal("manual"); }} onSelect={setSelectedEvent} />}
            </section>
            <section className="rail-card today-card"><div className="today-heading"><div><h2>오늘의 일정</h2><p className="rail-date">{format(today, "M월 d일 (EEE)", { locale: ko })}</p></div><button className="rail-more" onClick={openToday}><span>전체 일정 보기</span><ChevronRight /></button></div><div className="today-list">{todayEvents.length ? todayEvents.map((event) => <TodayItem key={event.id} event={event} onOpen={() => setSelectedEvent(event)} />) : <div className="home-empty-message"><CalendarDays /><span><strong>오늘 등록된 일정이 없습니다.</strong><small>새 일정을 추가하면 이곳에서 바로 확인할 수 있어요.</small></span></div>}</div></section>
            <section className="upcoming-strip"><div className="strip-title"><h2>다가오는 일정</h2><button onClick={openUpcoming}><span>더보기</span><ChevronRight /></button></div><div className="upcoming-list">{upcoming.length ? upcoming.map((event) => <UpcomingItem key={event.id} event={event} onOpen={() => setSelectedEvent(event)} />) : <div className="home-empty-message compact"><CalendarDays /><span><strong>다가오는 일정이 없습니다.</strong><small>새 일정을 추가하면 날짜가 가까운 순서대로 표시돼요.</small></span></div>}</div></section>
            {(!isFirebaseConfigured || currentUser?.isAnonymous) && <p className="demo-note">체험을 돕기 위한 예시 일정입니다. 직접 추가한 일정도 예시와 함께 표시됩니다.</p>}
          </div>
          <aside className="right-rail">
            <section className="rail-card quick-add"><h2>빠른 추가</h2>
              <form className="quick-message-input" onSubmit={(event) => { event.preventDefault(); if (message.trim()) analyze({ text: message.trim() }); }}>
                <div className="quick-message-heading"><MessageSquareText /><div><strong>메시지로 추가하기</strong><small>받은 메시지를 바로 붙여넣으세요.</small></div></div>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && message.trim()) {
                      event.preventDefault();
                      analyze({ text: message.trim() });
                    }
                  }}
                  placeholder="받은 메시지를 붙여넣어 보세요."
                  aria-label="일정으로 변환할 메시지"
                />
                <div className="quick-message-actions">
                  <button type="button" onClick={() => setModal("message")}><FileText />PDF로 추가</button>
                  <button type="submit" disabled={!message.trim() || analyzing}><Plus />{analyzing ? "분석 중..." : "일정 추가"}</button>
                </div>
              </form>
              <label className={`quick-photo-input ${analyzing ? "is-analyzing" : ""}`}><Images /><span><strong>{analyzing ? "사진 분석 중..." : "사진으로 추가하기"}</strong><small>사진을 선택하면 바로 일정을 찾아요 · 여러 장 가능</small></span><Plus /><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handleImages} disabled={loading || analyzing} /></label><button className="manual-add-card" onClick={() => setModal("manual")}><Plus /><span><strong>직접 추가하기</strong><small>날짜와 내용을 직접 작성</small></span><ChevronRight /></button></section>
          </aside>
        </div> : activeSection === "today" ? <section className="today-page">
          <header className="today-page-header"><div><span>오늘도 좋은 하루 보내세요</span><h1>오늘의 일정</h1><p>{format(today, "yyyy년 M월 d일 EEEE", { locale: ko })}</p></div><div className="today-add-actions"><button className="today-message-button" onClick={() => setModal("message")}><MessageSquareText /> 메시지로 추가</button><button className="today-photo-button" onClick={() => setModal("photo")}><Camera /> 사진으로 추가</button><button className="today-add-button" onClick={() => { setDraft({ ...emptyDraft, date: format(today, "yyyy-MM-dd") }); setModal("manual"); }}><Plus /> 직접 추가</button></div></header>
          {todayEvents.length ? <div className="today-page-list">{todayEvents.map((event) => <button className={`today-page-event c-${categories.indexOf(event.category)} ${event.completed ? "is-completed" : ""}`} key={event.id} onClick={() => setSelectedEvent(event)}><time>{event.startTime || "종일"}{event.endTime ? ` – ${event.endTime}` : ""}</time><div><span>{shortCategory(event.category)}</span><strong className={event.completed ? "completed-title" : ""}>{event.title}</strong><small>{event.location || "장소 미정"}{event.memo ? ` · ${event.memo}` : ""}</small></div><ChevronRight /></button>)}</div> : <div className="today-empty"><CalendarDays /><h2>오늘 등록된 일정이 없습니다.</h2><p>새 일정을 추가하거나 메시지와 사진에서 일정을 찾아보세요.</p><button onClick={() => { setDraft({ ...emptyDraft, date: format(today, "yyyy-MM-dd") }); setModal("manual"); }}><Plus /> 일정 추가하기</button></div>}
        </section> : activeSection === "upcoming" ? <section className="upcoming-page">
          <header className="upcoming-page-header"><div><span>가까운 날짜부터 차례대로</span><h1>다가오는 일정</h1><p>일정과 해야 할 일을 마감 순서대로 확인하세요.</p></div><div className="upcoming-summary"><span><b>{allUpcoming.filter(isTaskEvent).length}</b> 해야 할 일</span><span><b>{allUpcoming.filter((event) => !isTaskEvent(event)).length}</b> 일정</span></div></header>
          {allUpcoming.length ? <div className="upcoming-columns">
            <section className="upcoming-column task-column"><header><div><span className="task-dot" /><h2>해야 할 일</h2></div><p>제출·마감·완료해야 하는 항목</p></header><div className="upcoming-page-list">{allUpcoming.filter(isTaskEvent).map((event, index) => <PriorityUpcomingItem event={event} index={index} task key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!allUpcoming.some(isTaskEvent) && <div className="upcoming-column-empty">예정된 할 일이 없습니다.</div>}</div></section>
            <section className="upcoming-column event-column"><header><div><span className="event-dot" /><h2>일정</h2></div><p>수업·회의·행사 등 예정된 일정</p></header><div className="upcoming-page-list">{allUpcoming.filter((event) => !isTaskEvent(event)).map((event, index) => <PriorityUpcomingItem event={event} index={index} key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!allUpcoming.some((event) => !isTaskEvent(event)) && <div className="upcoming-column-empty">예정된 일정이 없습니다.</div>}</div></section>
          </div> : <div className="today-empty"><CalendarDays /><h2>다가오는 일정이 없습니다.</h2><p>새 일정을 추가하면 날짜가 가까운 순서대로 표시됩니다.</p></div>}
        </section> : activeSection === "deadline" ? <section className="deadline-page">
          <header className="deadline-page-header"><div><span>지난 항목과 완료 기록</span><h1>마감 일정</h1><p>다가오는 일정과 겹치지 않도록 기간이 지난 항목과 완료한 기록만 표시합니다.</p></div><div className="deadline-summary"><span><b>{pastEvents.length}</b> 기간 지남</span><span><b>{completedEvents.length}</b> 완료</span></div></header>
          <div className="deadline-columns">
            <section className="deadline-column overdue-column"><header><div><span className="overdue-dot" /><h2>기간이 지난 항목</h2></div><p>아직 완료하지 않은 지난 일정과 할 일</p></header><div className="deadline-list">{pastEvents.map((event) => <ArchiveEventItem event={event} key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!pastEvents.length && <div className="deadline-empty">기간이 지난 미완료 항목이 없습니다.</div>}</div></section>
            <section className="deadline-column completed-column"><header><div><span className="completed-dot" /><h2>완료된 항목</h2></div><p>완료 처리한 일정과 해야 할 일</p></header><div className="deadline-list">{completedEvents.map((event) => <ArchiveEventItem event={event} completed key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!completedEvents.length && <div className="deadline-empty">아직 완료된 항목이 없습니다.</div>}</div></section>
          </div>
        </section> : <HelpPage onOpenCalendar={openCalendar} onOpenToday={openToday} onOpenSettings={() => setModal("settings")} onOpenCategories={() => setModal("categories")} />}
      </div>
    </main>
    <Modal title="메시지로 추가하기" open={modal === "message"} onClose={() => setModal(null)}><div className="modal-body"><p className="helper">받은 문자나 메신저 내용을 붙여넣거나 PDF 안내문을 올려 주세요.</p><textarea className="modal-textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="메시지를 붙여넣어 주세요." /><label className="pdf-upload"><FileText /><span><strong>PDF로 일정 추가하기</strong><small>PDF · 최대 20MB</small></span><input type="file" accept="application/pdf,.pdf" onChange={handlePdf} /></label><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="primary-button" disabled={!message.trim() || loading} onClick={() => analyze({ text: message })}>{loading ? "분석 중..." : "메시지에서 일정 찾기"}</button></div></div></Modal>
    <Modal title="사진으로 추가하기" open={modal === "photo"} onClose={() => setModal(null)}><div className="modal-body"><label className="upload-zone"><Images /><strong>안내문 사진을 선택해 주세요.</strong><span>여러 장 선택 가능 · PNG, JPG, WEBP · 장당 최대 10MB</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handleImages} /></label><p className="upload-help">서로 이어지는 안내문도 최대 10장까지 한 번에 분석할 수 있어요.</p></div></Modal>
    <Modal title="직접 일정 추가" open={modal === "manual"} onClose={() => setModal(null)}><EventForm draft={draft} setDraft={setDraft} onSubmit={saveDraft} loading={loading} categoryOptions={categorySettings.map((category) => category.name)} /></Modal>
    <Modal title="분류 관리" open={modal === "categories"} onClose={() => setModal(null)} wide><div className="modal-body"><p className="helper">분류를 추가하거나 색상과 표시 여부를 관리하세요. 삭제된 분류의 일정은 ‘기타’로 이동합니다.</p><div className="category-add-row"><input value={newCategory.name} onChange={(event) => setNewCategory({ ...newCategory, name: event.target.value })} placeholder="새 분류 이름" /><input type="color" value={newCategory.color} onChange={(event) => setNewCategory({ ...newCategory, color: event.target.value })} /><button className="primary-button" onClick={addCategory}><Plus />추가</button></div><div className="category-settings editable">{categorySettings.map((category) => <div className="category-setting-item" key={category.name}><input type="checkbox" checked={visibleCategories.includes(category.name)} onChange={() => toggleCategory(category.name)} /><input type="color" value={category.color} onChange={(event) => updateCategoryColor(category.name, event.target.value)} /><span><strong>{category.name}</strong><small>{visibleEvents.filter((event) => event.category === category.name).length}개 일정</small></span><button disabled={category.name === "기타"} onClick={() => deleteCategory(category.name)} aria-label={`${category.name} 삭제`}><Trash2 /></button></div>)}</div><div className="settings-actions"><button className="secondary-button" onClick={() => { const all = categorySettings.map((category) => category.name); setVisibleCategories(all); localStorage.setItem("t-calendar-visible-categories", JSON.stringify(all)); }}>전체 표시</button><button className="primary-button" onClick={() => setModal(null)}>완료</button></div></div></Modal>
    <Modal title="설정" open={modal === "settings"} onClose={() => setModal(null)} wide><div className="modal-body settings-sections">
      <section><h3>화면 설정</h3><label className="setting-select">화면 모드<select value={uiSettings.theme} onChange={(event) => setUiSettings({ ...uiSettings, theme: event.target.value })}><option value="light">밝게</option><option value="dark">어둡게</option></select></label><label className="setting-select">글자 크기<select value={uiSettings.fontSize} onChange={(event) => setUiSettings({ ...uiSettings, fontSize: event.target.value })}><option value="small">작게</option><option value="normal">보통</option><option value="large">크게</option></select></label></section>
      <section><h3>알림 설정</h3><div className="setting-row"><span><strong>브라우저 알림</strong><small>이 브라우저에서 일정 알림을 받습니다.</small></span><label className="switch"><input type="checkbox" checked={notificationSettings.enabled} onChange={(event) => enableNotifications(event.target.checked)} /><i /></label></div><div className="setting-row"><span><strong>마감 1시간 전 알림</strong><small>완료하지 않은 마감 임박 일정을 알려드립니다.</small></span><label className="switch"><input type="checkbox" disabled={!notificationSettings.enabled} checked={notificationSettings.urgent} onChange={(event) => updateNotificationSetting("urgent", event.target.checked)} /><i /></label></div><div className="setting-row"><span><strong>오늘 일정 요약</strong><small>지정 시간에 오늘 일정을 알려드립니다.</small></span><label className="switch"><input type="checkbox" disabled={!notificationSettings.enabled} checked={notificationSettings.today} onChange={(event) => updateNotificationSetting("today", event.target.checked)} /><i /></label></div><label className="notification-time">요약 알림 시간<input type="time" value={notificationSettings.time} onChange={(event) => updateNotificationSetting("time", event.currentTarget.value)} /></label></section>
      <section><h3>학교 시간 설정</h3><p className="settings-description">AI가 ‘3교시’, ‘마감까지’ 같은 표현을 실제 시간으로 바꿀 때 사용합니다.</p><div className="period-settings">{schoolSettings.periods.map((time, index) => <label key={index}>{index + 1}교시<input type="time" value={time} onChange={(event) => updateSchoolSettings({ ...schoolSettings, periods: schoolSettings.periods.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /></label>)}</div><label className="notification-time">기본 마감 시간<input type="time" value={schoolSettings.defaultDeadline} onChange={(event) => updateSchoolSettings({ ...schoolSettings, defaultDeadline: event.target.value })} /></label></section>
      <section><h3>개인정보와 원본 자료</h3><div className="privacy-note"><ShieldAlert /><div><strong>메시지·사진·PDF 원본을 저장하지 않습니다.</strong><p>일정 분석을 위해 전송된 원본은 캘린더 데이터에 포함되지 않습니다. 전화번호나 주민등록번호 형태가 감지되면 전송 전에 경고합니다.</p></div></div></section>
      <section><h3>로그인 및 데이터 관리</h3><div className="account-card"><div><strong>{userName}</strong><small>{currentUser?.isAnonymous ? "체험 계정" : currentUser?.email || "로그인됨"}</small>{googleCalendarAccount && <small>Google Calendar 연결됨 · {googleCalendarAccount}</small>}</div><div className="account-actions"><button className="secondary-button" onClick={connectGoogleCalendar} disabled={Boolean(googleCalendarLoading)}><CalendarDays />{googleCalendarLoading === "connect" ? "Google 연결 중..." : googleCalendarToken ? "Google 계정 다시 연결" : "Google 계정과 연결하기"}</button><button className="secondary-button" onClick={exportToGoogleCalendar} disabled={!googleCalendarToken || Boolean(googleCalendarLoading)}><CalendarDays />{googleCalendarLoading === "export" ? "내보내는 중..." : "Google 캘린더로 내보내기"}</button><button className="secondary-button" onClick={shareToKakaoTalk}><Share2 />카카오톡으로 내보내기</button><button className="secondary-button" onClick={exportCalendar}><Download />ICS 내보내기</button><button className="secondary-button" disabled={!currentUser} onClick={() => currentUser && signOut(getFirebaseServices().auth)}>로그아웃</button><button className="danger-button" disabled={!currentUser || loading} onClick={deleteAccountAndData}>계정·데이터 삭제</button></div></div></section>
      <div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>완료</button></div>
    </div></Modal>
    <Modal title="전체 일정을 삭제할까요?" open={modal === "deleteAll"} onClose={() => setModal(null)}><div className="modal-body"><div className="delete-all-warning"><Trash2 /><div><strong>등록된 일정 {events.length}개가 모두 삭제됩니다.</strong><p>삭제한 일정은 복구할 수 없습니다.</p></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="danger-button" disabled={loading || !events.length || !isFirebaseConfigured} onClick={deleteAll}>{loading ? "삭제 중..." : "전체 삭제"}</button></div></div></Modal>
    <Modal title="일정 상세" open={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)}><div className="modal-body event-detail">{selectedEvent && <><div className="detail-badges"><div className={`detail-category c-${categories.indexOf(selectedEvent.category)}`}>{selectedEvent.category}</div>{selectedEvent.completed && <span className="detail-completed">완료됨</span>}</div><h3 className={selectedEvent.completed ? "completed-title" : ""}>{selectedEvent.title}</h3><dl><div><dt>날짜</dt><dd>{format(parseISO(selectedEvent.date), "yyyy년 M월 d일 (EEE)", { locale: ko })}</dd></div><div><dt>시간</dt><dd>{selectedEvent.allDay ? "종일" : `${selectedEvent.startTime || "시간 미정"}${selectedEvent.endTime ? ` – ${selectedEvent.endTime}` : ""}`}</dd></div><div><dt>장소</dt><dd>{selectedEvent.location || "장소 미정"}</dd></div><div><dt>메모</dt><dd>{selectedEvent.memo || "메모 없음"}</dd></div></dl><button className={`completion-button ${selectedEvent.completed ? "is-completed" : ""}`} disabled={loading} onClick={() => toggleCompleted(selectedEvent)}>{selectedEvent.completed ? "미완료로 되돌리기" : "일정 완료"}</button><div className="detail-actions"><button className="detail-copy" onClick={() => { setCopyTarget(selectedEvent); setCopyDate(format(addDays(parseISO(selectedEvent.date), 1), "yyyy-MM-dd")); setCopyTitle(selectedEvent.title); setCopyStartTime(selectedEvent.startTime); setCopyEndTime(selectedEvent.endTime); setSelectedEvent(null); }}><Plus /><span>복사하여 추가</span></button><button className="detail-edit" onClick={() => { setDraft(toDraft(selectedEvent)); setEditTarget(selectedEvent); setSelectedEvent(null); }}>수정</button><button className="detail-delete" onClick={() => { setDeleteTarget(selectedEvent); setSelectedEvent(null); }}>삭제</button></div></>}</div></Modal>
    <Modal title="일정 복사하기" open={Boolean(copyTarget)} onClose={() => setCopyTarget(null)}><form className="modal-body copy-event-form" onSubmit={saveCopy}>{copyTarget && <><span className={`detail-category c-${categories.indexOf(copyTarget.category)}`}>{copyTarget.category}</span><label className="copy-edit-field">일정 이름<input required value={copyTitle} onChange={(event) => setCopyTitle(event.target.value)} /></label><div className="copy-time-fields"><label>시작 시간<input type="time" value={copyStartTime} onChange={(event) => setCopyStartTime(event.target.value)} /></label><label>종료 시간<input type="time" value={copyEndTime} onChange={(event) => setCopyEndTime(event.target.value)} /></label></div><label className="copy-date-field">새 일정 날짜<input required type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)} /></label><p className="copy-helper">기존 일정의 이름과 시간을 불러왔습니다. 필요한 내용을 변경한 뒤 새 날짜에 복사하세요.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCopyTarget(null)}>취소</button><button type="submit" className="primary-button" disabled={loading || !copyTitle.trim()}>{loading ? "복사 중..." : "일정 복사"}</button></div></>}</form></Modal>
    <Modal title="일정 수정" open={Boolean(editTarget)} onClose={() => setEditTarget(null)}><EventForm draft={draft} setDraft={setDraft} onSubmit={saveEdit} loading={loading} submitLabel="수정 완료" categoryOptions={categorySettings.map((category) => category.name)} /></Modal>
    <Modal title="찾은 일정 확인" open={modal === "review"} onClose={() => setModal(null)} wide><div className="modal-body"><div className="review-toolbar"><div><p className="helper">날짜와 시간을 확인하고 필요한 내용을 직접 수정하세요.</p><span>원본 메시지와 파일은 저장하지 않습니다.</span></div><button className="secondary-button" onClick={() => setSelected(selected.length === candidates.length ? [] : candidates.map((_, index) => index))}>{selected.length === candidates.length ? "전체 해제" : "전체 선택"}</button></div><div className="candidate-list editable-candidates">{candidates.map((event, index) => <article className={`candidate-edit ${!event.date || event.confidence === "낮음" ? "needs-review" : ""}`} key={`${index}`}><header><label><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])}/><span>일정 {index + 1}</span></label><div>{event.confidence && <b className={`confidence confidence-${event.confidence}`}>신뢰도 {event.confidence}</b>}<button onClick={() => removeCandidate(index)} aria-label="후보 삭제"><Trash2 /></button></div></header>{(!event.date || event.confidence === "낮음") && <p className="candidate-warning">날짜 또는 인식 결과를 꼭 확인해 주세요.</p>}<div className="candidate-edit-grid"><label className="full">제목<input value={event.title} onChange={(change) => updateCandidate(index, "title", change.target.value)} /></label><label>날짜<input type="date" value={event.date} onChange={(change) => updateCandidate(index, "date", change.target.value)} /></label><label>분류<select value={event.category} onChange={(change) => updateCandidate(index, "category", change.target.value)}>{categorySettings.map((category) => <option key={category.name}>{category.name}</option>)}</select></label><label>시작 시간<input type="time" value={event.startTime} onChange={(change) => updateCandidate(index, "startTime", change.target.value)} /></label><label>종료 시간<input type="time" value={event.endTime} onChange={(change) => updateCandidate(index, "endTime", change.target.value)} /></label><label className="full">장소<input value={event.location} onChange={(change) => updateCandidate(index, "location", change.target.value)} /></label><label className="full">메모<textarea value={event.memo} onChange={(change) => updateCandidate(index, "memo", change.target.value)} /></label></div></article>)}</div>{!candidates.length && <div className="review-empty">새로 추가할 일정이 없습니다.</div>}<div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="primary-button" disabled={!selected.length || loading || selected.some((index) => !candidates[index]?.title || !candidates[index]?.date)} onClick={saveCandidates}>{selected.length}개 캘린더에 추가</button></div></div></Modal>
    <Modal title="일정을 삭제할까요?" open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}><div className="modal-body"><p><strong>{deleteTarget?.title}</strong> 일정을 삭제하면 되돌릴 수 없습니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>취소</button><button className="danger-button" onClick={() => deleteTarget && deleteSingleEvent(deleteTarget)}>삭제</button></div></div></Modal>
    {analyzing && <div className="analysis-loading" role="status" aria-live="polite"><div className="analysis-loading-card"><div className="analysis-spinner"><span /></div><strong>AI가 일정을 찾고 있어요</strong><p>사진 속 날짜와 내용을 분석하고 있습니다.<br />잠시만 기다려 주세요.</p><div className="analysis-progress"><i /></div></div></div>}
    <Modal title="T-Calendar 도움말" open={modal === "help"} onClose={() => setModal(null)} wide><div className="modal-body help-guide"><section className="help-intro"><h3>처음 사용하는 순서</h3><ol><li>메시지·PDF·사진 또는 직접 입력으로 일정을 추가합니다.</li><li>AI가 찾은 일정의 날짜와 시간을 검토하고 필요한 항목을 선택합니다.</li><li>캘린더에서 일정을 눌러 상세 확인, 완료 처리, 수정 또는 삭제합니다.</li><li>분류와 알림을 자신에게 맞게 설정합니다.</li></ol></section><section><h3>사이드바 메뉴 안내</h3><div className="help-menu-list"><article><CalendarDays /><div><strong>캘린더</strong><p>전체 일정을 월간·주간으로 봅니다. 날짜를 두 번 누르면 직접 추가할 수 있고 주간 보기에서 전체 삭제가 가능합니다.</p></div></article><article><CalendarDays /><div><strong>오늘의 일정</strong><p>오늘 일정만 시간순으로 확인하고 세 가지 방식으로 새 일정을 추가합니다.</p></div></article><article><CalendarDays /><div><strong>다가오는 일정</strong><p>오늘 이후 일정을 가까운 날짜부터, 해야 할 일과 일반 일정으로 나눠 보여줍니다.</p></div></article><article><CalendarDays /><div><strong>마감 일정</strong><p>기한이 지난 미완료 항목과 완료 처리한 기록을 확인합니다.</p></div></article><article><MessageSquareText /><div><strong>메시지로 추가하기</strong><p>메시지를 붙여넣거나 PDF를 올리면 AI가 일정을 찾아 검토 목록을 만듭니다.</p></div></article><article><Images /><div><strong>사진으로 추가하기</strong><p>안내문·시간표 사진을 최대 10장까지 분석합니다. 중복은 자동으로 숨깁니다.</p></div></article><article><Plus /><div><strong>직접 추가하기</strong><p>제목, 날짜, 시간, 분류, 장소와 메모를 직접 작성합니다.</p></div></article><article><Tag /><div><strong>분류 관리</strong><p>분류의 표시 여부, 이름, 색상, 추가와 삭제를 관리합니다.</p></div></article><article><Settings /><div><strong>설정</strong><p>화면과 글자 크기, 요약·마감 알림, 로그인 계정과 로그아웃을 관리합니다.</p></div></article><article><CircleHelp /><div><strong>도움말</strong><p>현재 보고 있는 사용 안내를 엽니다.</p></div></article></div></section><section><h3>검토와 알림 사용 팁</h3><ul><li>AI 분석 후 날짜와 시간을 확인한 뒤 필요한 일정만 선택하세요.</li><li>이미 등록됐거나 이름이 같은 중복 일정은 자동으로 제외됩니다.</li><li>마감 1시간 전 알림을 받으려면 브라우저 알림과 마감 시간을 설정하세요.</li><li>일정 상세에서 완료, 수정, 복사와 삭제를 할 수 있습니다.</li></ul></section><div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>확인</button></div></div></Modal>
    <Modal title="알림" open={modal === "notifications"} onClose={() => setModal(null)}><div className="notification-center"><header><div><strong>받은 알림</strong><span>읽지 않음 {unreadNotificationCount}개</span></div>{unreadNotificationCount > 0 && <button onClick={markAllNotificationsRead}>모두 읽음</button>}</header><div className="notification-history">{appNotifications.length ? appNotifications.map((notification) => <button className={`notification-history-item ${notification.read ? "is-read" : "is-unread"}`} key={notification.id} onClick={() => markNotificationRead(notification.id)}><span className="notification-status-dot" /><div><strong>{notification.title}</strong><p>{notification.body}</p><time>{format(parseISO(notification.createdAt), "M월 d일 HH:mm", { locale: ko })}</time></div>{!notification.read && <b>새 알림</b>}</button>) : <div className="notification-empty"><Bell /><strong>아직 받은 알림이 없습니다.</strong><p>오늘 일정 요약과 마감 1시간 전 알림이 이곳에 쌓입니다.</p></div>}</div><footer><button className="secondary-button" onClick={() => { setModal(null); setTimeout(() => setModal("settings"), 0); }}>알림 설정</button><button className="primary-button" onClick={() => setModal(null)}>닫기</button></footer></div></Modal>
    {completionPopup && <div className={`completion-popup toast-${completionPopup.type}`} role="status"><span>{completionPopup.type === "success" ? "✓" : completionPopup.type === "info" ? "↻" : completionPopup.type === "warning" ? "!" : "×"}</span><div><strong>{completionPopup.title}</strong><p>{completionPopup.message}</p></div><button onClick={() => setCompletionPopup(null)}><X /></button></div>}
  </div>;
}

function HelpPage({ onOpenCalendar, onOpenToday, onOpenSettings, onOpenCategories }: { onOpenCalendar: () => void; onOpenToday: () => void; onOpenSettings: () => void; onOpenCategories: () => void }) {
  return <section className="help-page">
    <header className="help-page-hero"><div><span>처음부터 차근차근</span><h1>T-Calendar 사용 안내</h1><p>일정을 가져오는 방법부터 검토, 분류, 알림, 완료 처리까지 실제 사용 순서대로 설명합니다.</p></div><button onClick={onOpenCalendar}><CalendarDays /> 캘린더로 돌아가기</button></header>
    <nav className="help-quick-nav"><a href="#help-start">시작하기</a><a href="#help-add">일정 추가</a><a href="#help-review">AI 검토</a><a href="#help-calendar">캘린더 관리</a><a href="#help-sidebar">전체 메뉴</a><a href="#help-settings">설정·알림</a></nav>
    <section className="help-page-section" id="help-start"><div className="help-section-heading"><b>01</b><div><h2>홈 화면 이해하기</h2><p>로그인하면 가장 먼저 월간 캘린더와 빠른 추가 영역을 확인할 수 있습니다.</p></div></div><figure className="help-screenshot"><img src="/help/t-calendar-home.png" alt="T-Calendar 홈 화면 예시" /><figcaption>홈 화면 예시 — 왼쪽 사이드바에서 화면을 이동하고, 중앙 캘린더에서 날짜별 일정을 확인합니다.</figcaption></figure><div className="help-callout"><strong>먼저 확인하세요</strong><p>오늘 날짜는 강조 표시되며 일정 카드를 누르면 상세 화면이 열립니다. 월간·주간 버튼으로 캘린더 표시 방식을 바꿀 수 있습니다.</p></div></section>
    <section className="help-page-section" id="help-add"><div className="help-section-heading"><b>02</b><div><h2>내 상황에 맞는 방법으로 일정 추가하기</h2><p>입력 자료에 따라 메시지, 사진, PDF, 직접 입력 중 가장 편한 방법을 선택하세요.</p></div></div><div className="help-method-grid"><article><MessageSquareText /><h3>메시지로 추가</h3><ol><li>사이드바에서 ‘메시지로 추가하기’를 누릅니다.</li><li>문자나 메신저 내용을 그대로 붙여넣습니다.</li><li>‘메시지에서 일정 찾기’를 누릅니다.</li><li>AI가 찾은 일정의 날짜와 시간을 검토합니다.</li></ol><p>하나의 메시지에 여러 일정이 있어도 각각 분리됩니다.</p></article><article><FileText /><h3>PDF로 추가</h3><ol><li>‘메시지로 추가하기’를 엽니다.</li><li>PDF 업로드 영역에서 20MB 이하 파일을 선택합니다.</li><li>문서의 여러 페이지를 AI가 함께 읽습니다.</li><li>필요한 일정만 선택해 저장합니다.</li></ol><p>학교 안내문, 가정통신문, 회의 자료에 적합합니다.</p></article><article><Images /><h3>사진으로 추가</h3><ol><li>‘사진으로 추가하기’를 누릅니다.</li><li>PNG·JPG·WEBP 사진을 최대 10장 선택합니다.</li><li>분석이 끝날 때까지 화면을 닫지 않습니다.</li><li>중복이 제거된 결과를 확인합니다.</li></ol><p>시간표는 날짜 열과 교시 행이 모두 보이게 촬영하면 정확도가 높아집니다.</p></article><article><Plus /><h3>직접 추가</h3><ol><li>‘직접 추가하기’를 누릅니다.</li><li>제목과 날짜를 필수로 입력합니다.</li><li>시간, 분류, 장소와 메모를 추가합니다.</li><li>‘일정 저장’을 누릅니다.</li></ol><p>짧은 개인 일정이나 즉시 기록할 일정에 적합합니다.</p></article></div></section>
    <section className="help-page-section" id="help-review"><div className="help-section-heading"><b>03</b><div><h2>AI가 찾은 일정 검토하기</h2><p>AI 분석 결과는 바로 저장되지 않으며 사용자가 마지막으로 확인합니다.</p></div></div><div className="help-steps"><article><span>1</span><div><h3>제목 확인</h3><p>수업명이나 행사명이 원문 의도와 맞는지 확인하세요. 동일한 이름의 중복 결과는 자동으로 숨겨집니다.</p></div></article><article><span>2</span><div><h3>날짜·시간 확인</h3><p>사진이 기울거나 연도가 생략된 문서는 날짜가 부정확할 수 있습니다. 특히 오전·오후와 마감 시간을 확인하세요.</p></div></article><article><span>3</span><div><h3>필요한 항목 선택</h3><p>체크된 일정만 저장됩니다. 필요하지 않은 일정은 체크를 해제하세요.</p></div></article><article><span>4</span><div><h3>캘린더에 추가</h3><p>버튼에 표시된 일정 개수를 확인하고 추가합니다. 기존 캘린더와 겹치는 일정은 다시 저장되지 않습니다.</p></div></article></div><div className="help-warning"><strong>인식 정확도를 높이는 촬영 방법</strong><ul><li>문서 전체가 잘리지 않게 정면에서 촬영하세요.</li><li>빛 반사와 그림자를 피하고 글자가 선명한 사진을 사용하세요.</li><li>시간표는 날짜 머리글과 교시 시간이 한 화면에 보이게 촬영하세요.</li><li>이어지는 문서는 순서대로 여러 장을 선택하세요.</li></ul></div></section>
    <section className="help-page-section" id="help-calendar"><div className="help-section-heading"><b>04</b><div><h2>등록한 일정 관리하기</h2><p>일정을 누르면 상세 정보와 관리 기능이 표시됩니다.</p></div></div><div className="help-feature-list"><article><strong>상세 보기</strong><p>날짜, 시간, 장소, 메모와 분류를 한 번에 확인합니다.</p></article><article><strong>완료 처리</strong><p>마감이나 할 일을 끝냈다면 ‘완료로 표시’를 누릅니다. 완료 항목은 마감 일정의 완료 목록으로 이동합니다.</p></article><article><strong>수정</strong><p>잘못 인식된 제목·날짜·시간·분류를 고쳐 저장합니다.</p></article><article><strong>복사하여 추가</strong><p>비슷한 일정을 새 날짜에 만들 때 기존 정보를 복사합니다.</p></article><article><strong>삭제</strong><p>하나의 일정만 삭제합니다. 주간 보기의 ‘전체 삭제’는 모든 일정을 지우므로 주의하세요.</p></article><article><strong>분류 필터</strong><p>캘린더의 필터 또는 분류 관리에서 보고 싶은 분류만 선택합니다.</p></article></div><div className="help-inline-actions"><button onClick={onOpenCalendar}><CalendarDays />캘린더 보기</button><button onClick={onOpenToday}><CalendarDays />오늘 일정 보기</button></div></section>
    <section className="help-page-section" id="help-sidebar"><div className="help-section-heading"><b>05</b><div><h2>사이드바 메뉴 전체 안내</h2><p>각 메뉴가 어떤 정보를 보여주고 언제 사용하면 좋은지 설명합니다.</p></div></div><div className="help-menu-table"><article><CalendarDays /><div><h3>캘린더</h3><p>전체 일정을 월간 또는 주간으로 확인합니다. 일정의 전체 흐름을 볼 때 사용합니다.</p><small>팁: 날짜를 두 번 누르면 그 날짜로 직접 일정 추가 화면이 열립니다.</small></div></article><article><CalendarDays /><div><h3>오늘의 일정</h3><p>오늘 일정만 시간순으로 모아 봅니다. 출근 후 하루 일과를 확인할 때 유용합니다.</p></div></article><article><CalendarDays /><div><h3>다가오는 일정</h3><p>오늘 이후 항목을 가까운 날짜부터 보여주며 해야 할 일과 일반 일정을 구분합니다.</p></div></article><article><CalendarDays /><div><h3>마감 일정</h3><p>기한이 지났지만 완료하지 않은 항목과 완료 기록을 나눠 확인합니다.</p></div></article><article><MessageSquareText /><div><h3>메시지로 추가하기</h3><p>메시지 붙여넣기와 PDF 업로드를 통해 AI가 일정을 추출합니다.</p></div></article><article><Images /><div><h3>사진으로 추가하기</h3><p>안내문이나 시간표 사진을 한 장 또는 여러 장 분석합니다.</p></div></article><article><Plus /><div><h3>직접 추가하기</h3><p>분석 없이 날짜와 내용을 직접 입력해 즉시 저장합니다.</p></div></article><article><Tag /><div><h3>분류 관리</h3><p>분류 추가·삭제, 색상, 표시 여부를 관리합니다. 삭제된 분류의 일정은 ‘기타’로 이동합니다.</p></div></article><article><Settings /><div><h3>설정</h3><p>화면 모드, 글자 크기, 브라우저 알림, 요약 시간과 로그인 계정을 관리합니다.</p></div></article><article><CircleHelp /><div><h3>도움말</h3><p>현재 보고 있는 상세 사용 안내 화면으로 이동합니다.</p></div></article></div></section>
    <section className="help-page-section" id="help-settings"><div className="help-section-heading"><b>06</b><div><h2>분류·알림·계정 설정하기</h2><p>자주 사용하는 방식에 맞게 캘린더를 조정하세요.</p></div></div><div className="help-method-grid compact"><article><Tag /><h3>분류와 색상</h3><p>새 분류 이름과 색상을 추가할 수 있습니다. 체크를 끄면 삭제하지 않고 캘린더에서만 숨깁니다.</p><button onClick={onOpenCategories}>분류 관리 열기</button></article><article><Bell /><h3>알림</h3><p>브라우저 권한을 허용한 뒤 오늘 일정 요약 시간과 미완료 마감 1시간 전 알림을 설정합니다. 마감 일정에는 시간이 입력되어 있어야 합니다.</p><button onClick={onOpenSettings}>알림 설정 열기</button></article><article><Settings /><h3>화면</h3><p>밝게·어둡게 모드와 글자 크기를 선택합니다. 설정은 현재 브라우저에 저장됩니다.</p></article><article><CircleHelp /><h3>로그인</h3><p>현재 계정을 확인하거나 로그아웃할 수 있습니다. 로그아웃하기 전에 저장이 끝났는지 확인하세요.</p></article></div></section>
    <section className="help-page-footer"><h2>빠르게 시작해 보세요</h2><p>처음이라면 메시지나 안내문 사진 하나를 준비하고 AI 일정 추출부터 사용해 보세요.</p><div><button onClick={onOpenCalendar}>캘린더로 이동</button><button onClick={onOpenToday}>오늘 일정 확인</button></div></section>
  </section>;
}

function MonthCalendar({ month, events, onAdd, onSelect }: { month: Date; events: CalendarEvent[]; onAdd: (date: string) => void; onSelect: (event: CalendarEvent) => void }) {
  const cells = useMemo(() => { const from = startOfWeek(startOfMonth(month)); const to = endOfWeek(endOfMonth(month)); const result: Date[] = []; for (let day = from; day <= to; day = addDays(day, 1)) result.push(day); return result; }, [month]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  useEffect(() => setExpandedDate(null), [month]);
  return <div className="month-calendar"><div className="weekday-row">{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <span className={index === 0 ? "sun" : index === 6 ? "sat" : ""} key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const dayEvents = events.filter((event) => event.date === dateKey);
    const expanded = expandedDate === dateKey;
    const displayedEvents = expanded ? dayEvents : dayEvents.slice(0, 2);
    return <div key={day.toISOString()} className={`day-cell ${dayEvents.length > 1 ? "has-multiple" : ""} ${expanded ? "is-expanded" : ""} ${!isSameMonth(day, month) ? "outside" : ""} ${isSameDay(day, today) ? "selected" : ""}`} onDoubleClick={() => onAdd(dateKey)}>
      <span className="day-number">{format(day, "d")}</span>
      <div className="cell-events">
        {displayedEvents.map((event) => <button className={`cell-event c-${categories.indexOf(event.category)} ${event.completed ? "is-completed" : ""}`} key={event.id} onDoubleClick={(click) => click.stopPropagation()} onClick={() => onSelect(event)}><b>{shortCategory(event.category)}</b><small>{event.startTime}</small><em className={event.completed ? "completed-title" : ""}>{event.title}</em></button>)}
        {dayEvents.length > 2 && <button className="more-events" type="button" aria-expanded={expanded} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setExpandedDate(expanded ? null : dateKey); }}><ChevronDown /><span>{expanded ? "접기" : `+${dayEvents.length - 2}개`}</span><span className="more-events-desktop">{expanded ? "" : " 더보기"}</span></button>}
      </div>
    </div>;
  })}</div></div>;
}
function WeekCalendar({ week, events, onAdd, onSelect }: { week: Date; events: CalendarEvent[]; onAdd: (date: string) => void; onSelect: (event: CalendarEvent) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(week), index));
  return <div className="week-calendar">{days.map((day, index) => { const dayEvents = events.filter((event) => event.date === format(day, "yyyy-MM-dd")); return <section className={`week-day ${isSameDay(day, today) ? "is-today" : ""}`} key={day.toISOString()}><button className="week-day-heading" onDoubleClick={() => onAdd(format(day, "yyyy-MM-dd"))}><span className={index === 0 ? "sun" : index === 6 ? "sat" : ""}>{format(day, "EEE", { locale: ko })}</span><strong>{format(day, "d")}</strong></button><div className="week-events">{dayEvents.length ? dayEvents.map((event) => <button className={`week-event c-${categories.indexOf(event.category)} ${event.completed ? "is-completed" : ""}`} key={event.id} onClick={() => onSelect(event)}><span><b>{shortCategory(event.category)}</b>{event.startTime || "종일"}</span><strong className={event.completed ? "completed-title" : ""}>{event.title}</strong><small>{event.location || "장소 미정"}</small></button>) : <button className="week-empty" onClick={() => onAdd(format(day, "yyyy-MM-dd"))}><Plus /> 일정 추가</button>}</div></section>; })}</div>;
}
function shortCategory(category: EventCategory) { return category === "제출 및 마감" ? "마감" : category.replace("학교 ", ""); }
function isTaskEvent(event: CalendarEvent) {
  return event.category === "제출 및 마감" || /제출|마감|과제|완료|준비|신청|보고서|계획서/.test(`${event.title} ${event.memo}`);
}
function toDraft(event: CalendarEvent): EventDraft {
  const { title, date, startTime, endTime, location, category, memo, allDay, completed, completedAt, recurrence, reminderMinutes, supplies, link } = event;
  return { title, date, startTime, endTime, location, category, memo, allDay, completed, completedAt, recurrence: recurrence || "none", reminderMinutes: reminderMinutes || [], supplies: supplies || "", link: link || "" };
}
function normalizeEventText(value = "") {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}
function canonicalEventTitle(value = "") {
  return normalizeEventText(value)
    .replace(/\d+교시/g, "")
    .replace(/초등|중등|고등|\d+학년|\d+반/g, "")
    .replace(/^(오전|오후)/, "")
    .replace(/(정규)?수업|교과|과목|일정|시간/g, "");
}
function subjectKey(value = "") {
  const normalized = canonicalEventTitle(value);
  return ["국어", "수학", "사회", "과학", "영어", "도덕", "체육", "음악", "미술", "실과", "창체"].find((subject) => normalized.includes(subject)) || "";
}
function titleSimilarity(left: string, right: string) {
  const a = canonicalEventTitle(left);
  const b = canonicalEventTitle(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return 0.9;
  const pairs = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const aPairs = pairs(a);
  const bPairs = pairs(b);
  if (!aPairs.size || !bPairs.size) return 0;
  const shared = [...aPairs].filter((pair) => bPairs.has(pair)).length;
  return (2 * shared) / (aPairs.size + bPairs.size);
}
function eventsOverlap(left: EventDraft, right: EventDraft | CalendarEvent) {
  if (!left.date || left.date !== right.date) return false;
  const similarity = titleSimilarity(left.title, right.title);
  const sameTime = Boolean(left.startTime && right.startTime && left.startTime === right.startTime);
  const sameCanonicalTitle = Boolean(canonicalEventTitle(left.title) && canonicalEventTitle(left.title) === canonicalEventTitle(right.title));
  const leftSubject = subjectKey(left.title);
  const sameSubject = Boolean(leftSubject && leftSubject === subjectKey(right.title));
  return sameSubject || sameCanonicalTitle || similarity >= 0.78 || (sameTime && similarity >= 0.5);
}
function eventInformationScore(event: EventDraft) {
  return [event.startTime, event.endTime, event.location, event.memo].filter(Boolean).length + normalizeEventText(event.title).length / 100;
}
function mergeDuplicateEvents(primary: EventDraft, duplicate: EventDraft) {
  const richer = eventInformationScore(duplicate) > eventInformationScore(primary) ? duplicate : primary;
  const other = richer === primary ? duplicate : primary;
  return {
    ...richer,
    startTime: richer.startTime || other.startTime,
    endTime: richer.endTime || other.endTime,
    location: richer.location || other.location,
    memo: richer.memo || other.memo,
  };
}
function deduplicateExtractedEvents(events: EventDraft[]) {
  return events.reduce<EventDraft[]>((unique, event) => {
    const eventName = normalizeEventText(event.title);
    const duplicateIndex = unique.findIndex((saved) => Boolean(eventName && eventName === normalizeEventText(saved.title)) || eventsOverlap(event, saved));
    if (duplicateIndex === -1) unique.push(event);
    else unique[duplicateIndex] = mergeDuplicateEvents(unique[duplicateIndex], event);
    return unique;
  }, []);
}
function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
async function prepareImage(file: File) {
  const source = await readAsDataUrl(file);
  if (file.size <= 4 * 1024 * 1024) return { image: source.split(",")[1], mimeType: file.type };
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 처리하지 못했습니다.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/jpeg", 0.76);
  return { image: compressed.split(",")[1], mimeType: "image/jpeg" };
}
function TodayItem({ event, onOpen }: { event: CalendarEvent; onOpen: () => void }) { return <button className={`today-item c-${categories.indexOf(event.category)} ${event.completed ? "is-completed" : ""}`} onClick={onOpen}><div><span><b>{shortCategory(event.category)}</b>{event.startTime}</span><strong className={event.completed ? "completed-title" : ""}>{event.title}</strong><small>{event.location || "장소 미정"}</small></div><ChevronRight /></button>; }
function UpcomingItem({ event, onOpen }: { event: CalendarEvent; onOpen: () => void }) { return <button onClick={onOpen}><span className={`upcoming-badge c-${categories.indexOf(event.category)}`}>{shortCategory(event.category)}</span><time>{format(parseISO(event.date), "M.d (EEE)", { locale: ko })} {event.startTime}</time><strong>{event.title}</strong><small>{event.location || "장소 미정"}</small></button>; }
function PriorityUpcomingItem({ event, index, task = false, onOpen }: { event: CalendarEvent; index: number; task?: boolean; onOpen: () => void }) {
  const daysLeft = differenceInCalendarDays(parseISO(event.date), today);
  return <button className={`upcoming-page-event ${task ? "is-task" : "is-event"}`} onClick={onOpen}><span className="priority-number">{index + 1}</span><div className="upcoming-date"><b>{daysLeft === 1 ? "내일" : `D-${daysLeft}`}</b><time>{format(parseISO(event.date), "M월 d일 (EEE)", { locale: ko })}</time></div><div className="upcoming-main"><span className="upcoming-type">{task ? "해야 할 일" : "일정"}</span><strong>{event.title}</strong><small>{event.startTime || "시간 미정"} · {event.location || "장소 미정"}{event.memo ? ` · ${event.memo}` : ""}</small></div><ChevronRight /></button>;
}
function ArchiveEventItem({ event, completed = false, onOpen }: { event: CalendarEvent; completed?: boolean; onOpen: () => void }) {
  const type = isTaskEvent(event) ? "해야 할 일" : "일정";
  return <button className={`archive-event ${completed ? "is-completed" : "is-overdue"}`} onClick={onOpen}><div className="archive-status"><span>{completed ? "완료" : "기간 지남"}</span><time>{format(parseISO(event.date), "yyyy.MM.dd (EEE)", { locale: ko })}</time></div><div className="archive-main"><span>{type}</span><strong className={completed ? "completed-title" : ""}>{event.title}</strong><small>{event.startTime || "시간 미정"} · {event.location || "장소 미정"}</small></div><ChevronRight /></button>;
}
function EventForm({ draft, setDraft, onSubmit, loading, submitLabel = "일정 저장", categoryOptions }: { draft: EventDraft; setDraft: (draft: EventDraft) => void; onSubmit: (event: FormEvent) => void; loading: boolean; submitLabel?: string; categoryOptions: string[] }) {
  const change = (key: keyof EventDraft, value: EventDraft[keyof EventDraft]) => setDraft({ ...draft, [key]: value });
  const toggleReminder = (minutes: number) => {
    const current = draft.reminderMinutes || [];
    change("reminderMinutes", current.includes(minutes) ? current.filter((item) => item !== minutes) : [...current, minutes]);
  };
  return <form className="modal-body form-grid" onSubmit={onSubmit}>
    <label className="full">일정 제목<input required value={draft.title} onChange={(event) => change("title", event.target.value)} placeholder="일정 제목" /></label>
    <label>날짜<input required type="date" value={draft.date} onChange={(event) => change("date", event.target.value)} /></label>
    <label>분류<select value={draft.category} onChange={(event) => change("category", event.target.value)}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="full inline-check"><input type="checkbox" checked={Boolean(draft.allDay)} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked, startTime: event.target.checked ? "" : draft.startTime, endTime: event.target.checked ? "" : draft.endTime })} />종일 일정</label>
    {!draft.allDay && <><label>시작 시간<input type="time" value={draft.startTime} onChange={(event) => change("startTime", event.target.value)} /></label><label>종료 시간<input type="time" value={draft.endTime} onChange={(event) => change("endTime", event.target.value)} /></label></>}
    <label className="full">장소<input value={draft.location} onChange={(event) => change("location", event.target.value)} placeholder="장소" /></label>
    <label className="full">준비물<input value={draft.supplies || ""} onChange={(event) => change("supplies", event.target.value)} placeholder="준비물 또는 사전 준비 사항" /></label>
    <label className="full">관련 링크<input type="url" value={draft.link || ""} onChange={(event) => change("link", event.target.value)} placeholder="https://" /></label>
    <label className="full">메모<textarea value={draft.memo} onChange={(event) => change("memo", event.target.value)} /></label>
    <fieldset className="full recurrence-field"><legend>반복 일정</legend><label className="inline-check"><input type="checkbox" checked={Boolean(draft.recurrence && draft.recurrence !== "none")} onChange={(event) => change("recurrence", event.target.checked ? "weekly" : "none")} />이 일정을 반복</label>{draft.recurrence && draft.recurrence !== "none" && <select value={draft.recurrence} onChange={(event) => change("recurrence", event.target.value as EventDraft["recurrence"])}><option value="weekly">매주</option><option value="monthly">매월</option><option value="yearly">매년</option></select>}</fieldset>
    <fieldset className="full reminder-field"><legend>일정 알림</legend><div>{[[10, "10분 전"], [30, "30분 전"], [60, "1시간 전"], [1440, "하루 전"]].map(([minutes, label]) => <label className="inline-check" key={minutes}><input type="checkbox" checked={(draft.reminderMinutes || []).includes(Number(minutes))} onChange={() => toggleReminder(Number(minutes))} />{label}</label>)}</div><small>앱이 열려 있고 브라우저 알림이 허용된 경우 동작합니다.</small></fieldset>
    <div className="modal-actions full"><button type="submit" className="primary-button" disabled={loading}>{loading ? "저장 중..." : submitLabel}</button></div>
  </form>;
}
