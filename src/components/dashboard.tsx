"use client";

import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, CalendarDays, Camera, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Menu, MessageSquareText, Plus, Search, Settings, SlidersHorizontal, Tag, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createEvent, removeEvent, subscribeToEvents } from "@/lib/events";
import { isFirebaseConfigured } from "@/lib/firebase";
import type { CalendarEvent, EventCategory, EventDraft } from "@/types/calendar";
import { Logo } from "./logo";
import { Modal } from "./modal";

const categories: EventCategory[] = ["학교 행사", "수업", "회의", "연수", "제출 및 마감", "학급 일정", "학생 관련", "학부모 관련", "개인 일정", "기타"];
const today = new Date();
const sample = (id: string, offset: number, title: string, time: string, category: EventCategory, location = ""): CalendarEvent => ({ id, title, date: format(addDays(today, offset), "yyyy-MM-dd"), startTime: time, endTime: "", location, category, memo: "" });
const samples: CalendarEvent[] = [
  sample("s1", 0, "교직원 회의", "15:00", "회의", "시청각실"), sample("s2", 0, "여름방학 안전교육 연수", "18:00", "연수", "온라인(ZOOM)"),
  sample("s3", 0, "체험학습 계획서 제출", "23:59", "제출 및 마감", "이메일 제출"), sample("s4", 1, "교실혁신 연수", "13:30", "연수", "2층 컴퓨터실"),
  sample("s5", 2, "5학년 과학 실험 수업", "09:00", "수업", "과학실"), sample("s6", 5, "여름학교 운영", "09:00", "학교 행사", "체육관"),
  sample("s7", -6, "학급회의", "10:20", "학급 일정"), sample("s8", -9, "교육계획서 마감", "18:00", "제출 및 마감"),
];
const emptyDraft: EventDraft = { title: "", date: format(today, "yyyy-MM-dd"), startTime: "", endTime: "", location: "", category: "기타", memo: "", allDay: false };

export default function Dashboard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(startOfMonth(today));
  const [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState<"message" | "photo" | "manual" | "review" | null>(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [candidates, setCandidates] = useState<EventDraft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);

  useEffect(() => { let stop: () => void = () => undefined; subscribeToEvents(setEvents).then((unsubscribe) => { stop = unsubscribe; }).catch(() => undefined); return () => stop(); }, []);
  const visibleEvents = isFirebaseConfigured ? events : samples;
  const todayEvents = visibleEvents.filter((event) => isSameDay(parseISO(event.date), today));
  const upcoming = visibleEvents.filter((event) => parseISO(event.date) > today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);

  async function analyze(payload: { text?: string; image?: string; mimeType?: string }) {
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setCandidates(data.events); setSelected(data.events.map((_: EventDraft, index: number) => index)); setModal("review");
    } catch (error) { setNotice(error instanceof Error ? error.message : "일정을 분석하지 못했습니다."); } finally { setLoading(false); }
  }
  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setNotice("10MB 이하 이미지를 선택해 주세요.");
    const reader = new FileReader(); reader.onload = () => analyze({ image: String(reader.result).split(",")[1], mimeType: file.type }); reader.readAsDataURL(file);
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault(); setLoading(true);
    try { await createEvent(draft); setModal(null); setDraft(emptyDraft); setNotice("일정을 저장했습니다."); } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setLoading(false); }
  }
  async function saveCandidates() {
    setLoading(true);
    try { await Promise.all(selected.map((index) => createEvent(candidates[index]))); setModal(null); setMessage(""); setNotice(`${selected.length}개 일정을 저장했습니다.`); } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setLoading(false); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="sidebar-top"><Logo /><span>교사를 위한 스마트 캘린더</span><button className="mobile-close" onClick={() => setSidebar(false)} aria-label="메뉴 닫기"><X /></button></div>
      <nav aria-label="주요 메뉴">
        <button className="nav-item active"><CalendarDays />캘린더</button><button className="nav-item"><CalendarDays />오늘의 일정</button><button className="nav-item"><CalendarDays />다가오는 일정</button>
        <button className="nav-item"><CalendarDays />마감 일정 <b className="nav-count">2</b></button><button className="nav-item" onClick={() => setModal("manual")}><Plus />일정 추가</button><div className="nav-divider" />
        <button className="nav-item" onClick={() => setModal("message")}><MessageSquareText />메시지/사진 일정 추가</button><button className="nav-item" onClick={() => setModal("manual")}><Plus />직접 일정 추가</button><div className="nav-divider" />
        <button className="nav-item"><Tag />분류 관리</button><button className="nav-item"><Bell />알림 설정</button><div className="nav-divider" /><button className="nav-item"><Settings />설정</button><button className="nav-item"><CircleHelp />도움말</button>
      </nav>
      <div className="tip-card"><strong>T-Calendar 꿀팁!</strong><p>메시지를 붙여넣기만 해도<br />일정을 자동으로 찾아드려요.</p><button onClick={() => setModal("message")}>자세히 보기 <ChevronRight /></button><span>🐿️</span></div>
    </aside>
    {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="메뉴 닫기" />}
    <main>
      <header className="topbar"><button className="menu-button" onClick={() => setSidebar(true)} aria-label="메뉴 열기"><Menu /></button><div className="mobile-logo"><Logo compact /></div>
        <label className="search-box"><input placeholder="일정 검색 (예: 회의, 연수, 마감)" /><Search /></label>
        <div className="top-actions"><button className="icon-button alarm" aria-label="알림"><Bell /><i>3</i></button><button className="icon-button" aria-label="도움말"><CircleHelp /></button><span className="user-avatar">👩🏻</span><strong>김선생님</strong><ChevronDown /></div>
      </header>
      <div className="content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}><X /></button></div>}
        <div className="workspace">
          <section className="calendar-card">
            <div className="calendar-toolbar"><div className="month-nav"><h1>{format(month, "yyyy년 M월")}</h1><button onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft /></button><button onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></button><button onClick={() => setMonth(startOfMonth(today))}>오늘</button></div>
              <div className="view-tools"><div className="view-switch"><button className="active">월간</button><button>주간</button><button>일간</button></div><button className="filter-button"><SlidersHorizontal />필터</button></div></div>
            <MonthCalendar month={month} events={visibleEvents} onAdd={(date) => { setDraft({ ...emptyDraft, date }); setModal("manual"); }} />
          </section>
          <aside className="right-rail"><section className="rail-card today-card"><h2>오늘의 일정</h2><p className="rail-date">{format(today, "M월 d일 (EEE)", { locale: ko })}</p><div className="today-list">{todayEvents.map((event) => <TodayItem key={event.id} event={event} onDelete={() => setDeleteTarget(event)} />)}</div><button className="rail-more">전체 일정 보기 <ChevronRight /></button></section>
            <section className="rail-card quick-add"><h2>빠른 추가</h2><button onClick={() => setModal("message")}><MessageSquareText /><span><strong>메시지 붙여넣기</strong><small>일정 자동 인식</small></span><ChevronRight /></button><label><Camera /><span><strong>사진 촬영/업로드</strong><small>이미지 일정 인식</small></span><ChevronRight /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} /></label><button className="direct-add" onClick={() => setModal("manual")}><Plus />직접 일정 추가</button></section>
          </aside>
        </div>
        <section className="upcoming-strip"><div className="strip-title"><h2>다가오는 일정</h2><button>더보기 <ChevronRight /></button></div><div className="upcoming-list">{upcoming.map((event) => <UpcomingItem key={event.id} event={event} />)}</div></section>
        {!isFirebaseConfigured && <p className="demo-note">현재 예시 일정으로 표시 중입니다. Firebase 연결 시 실제 일정이 표시됩니다.</p>}
      </div>
    </main>
    <Modal title="메시지에서 일정 찾기" open={modal === "message"} onClose={() => setModal(null)}><div className="modal-body"><p className="helper">받은 문자나 메신저 내용을 그대로 붙여넣으세요.</p><textarea className="modal-textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="메시지를 붙여넣어 주세요." /><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="primary-button" disabled={!message.trim() || loading} onClick={() => analyze({ text: message })}>{loading ? "분석 중..." : "일정 찾기"}</button></div></div></Modal>
    <Modal title="사진에서 일정 찾기" open={modal === "photo"} onClose={() => setModal(null)}><div className="modal-body"><label className="upload-zone"><Camera /><strong>안내문 사진을 선택해 주세요.</strong><span>PNG, JPG, WEBP · 최대 10MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} /></label></div></Modal>
    <Modal title="직접 일정 추가" open={modal === "manual"} onClose={() => setModal(null)}><EventForm draft={draft} setDraft={setDraft} onSubmit={saveDraft} loading={loading} /></Modal>
    <Modal title="찾은 일정 확인" open={modal === "review"} onClose={() => setModal(null)} wide><div className="modal-body"><p className="helper">날짜와 시간을 확인하고 필요한 일정만 선택하세요.</p><div className="candidate-list">{candidates.map((event, index) => <label className="candidate" key={`${event.title}-${index}`}><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])}/><div><strong>{event.title}</strong><b>{event.date || "날짜 확인 필요"} {event.startTime}</b><span>{event.location || "장소 미정"} · {event.category}</span></div></label>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="primary-button" disabled={!selected.length || loading} onClick={saveCandidates}>{selected.length}개 캘린더에 추가</button></div></div></Modal>
    <Modal title="일정을 삭제할까요?" open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}><div className="modal-body"><p><strong>{deleteTarget?.title}</strong> 일정을 삭제하면 되돌릴 수 없습니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>취소</button><button className="danger-button" onClick={async () => { if (deleteTarget && isFirebaseConfigured) await removeEvent(deleteTarget.id); setDeleteTarget(null); }}>삭제</button></div></div></Modal>
  </div>;
}

function MonthCalendar({ month, events, onAdd }: { month: Date; events: CalendarEvent[]; onAdd: (date: string) => void }) {
  const cells = useMemo(() => { const from = startOfWeek(startOfMonth(month)); const to = endOfWeek(endOfMonth(month)); const result: Date[] = []; for (let day = from; day <= to; day = addDays(day, 1)) result.push(day); return result; }, [month]);
  return <div className="month-calendar"><div className="weekday-row">{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <span className={index === 0 ? "sun" : index === 6 ? "sat" : ""} key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day) => { const dayEvents = events.filter((event) => event.date === format(day, "yyyy-MM-dd")); return <button key={day.toISOString()} className={`day-cell ${!isSameMonth(day, month) ? "outside" : ""} ${isSameDay(day, today) ? "selected" : ""}`} onDoubleClick={() => onAdd(format(day, "yyyy-MM-dd"))}><span className="day-number">{format(day, "d")}</span><div className="cell-events">{dayEvents.slice(0, 2).map((event) => <span className={`cell-event c-${categories.indexOf(event.category)}`} key={event.id}><b>{shortCategory(event.category)}</b><small>{event.startTime}</small><em>{event.title}</em></span>)}{dayEvents.length > 2 && <span className="more-events">+{dayEvents.length - 2}개 더보기</span>}</div></button>; })}</div></div>;
}
function shortCategory(category: EventCategory) { return category === "제출 및 마감" ? "마감" : category.replace("학교 ", ""); }
function TodayItem({ event, onDelete }: { event: CalendarEvent; onDelete: () => void }) { return <article className={`today-item c-${categories.indexOf(event.category)}`}><div><span><b>{shortCategory(event.category)}</b>{event.startTime}</span><strong>{event.title}</strong><small>{event.location || "장소 미정"}</small></div><button onClick={onDelete}><Bell /></button></article>; }
function UpcomingItem({ event }: { event: CalendarEvent }) { return <article><span className={`upcoming-badge c-${categories.indexOf(event.category)}`}>{shortCategory(event.category)}</span><time>{format(parseISO(event.date), "M.d (EEE)", { locale: ko })} {event.startTime}</time><strong>{event.title}</strong><small>{event.location || "장소 미정"}</small></article>; }
function EventForm({ draft, setDraft, onSubmit, loading }: { draft: EventDraft; setDraft: (draft: EventDraft) => void; onSubmit: (event: FormEvent) => void; loading: boolean }) { const change = (key: keyof EventDraft, value: string | boolean) => setDraft({ ...draft, [key]: value }); return <form className="modal-body form-grid" onSubmit={onSubmit}><label className="full">일정 제목<input required value={draft.title} onChange={(e) => change("title", e.target.value)} placeholder="일정 제목" /></label><label>날짜<input required type="date" value={draft.date} onChange={(e) => change("date", e.target.value)} /></label><label>분류<select value={draft.category} onChange={(e) => change("category", e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>시작 시간<input type="time" value={draft.startTime} onChange={(e) => change("startTime", e.target.value)} /></label><label>종료 시간<input type="time" value={draft.endTime} onChange={(e) => change("endTime", e.target.value)} /></label><label className="full">장소<input value={draft.location} onChange={(e) => change("location", e.target.value)} placeholder="장소" /></label><label className="full">메모<textarea value={draft.memo} onChange={(e) => change("memo", e.target.value)} /></label><div className="modal-actions full"><button type="submit" className="primary-button" disabled={loading}>{loading ? "저장 중..." : "일정 저장"}</button></div></form>; }
