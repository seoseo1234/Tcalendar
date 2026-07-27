"use client";

import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, CalendarDays, Camera, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Menu, MessageSquareText, Plus, Search, Settings, SlidersHorizontal, Tag, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { createEvent, removeEvent, subscribeToEvents, updateEvent } from "@/lib/events";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase";
import type { CalendarEvent, EventCategory, EventDraft } from "@/types/calendar";
import { Logo } from "./logo";
import { Modal } from "./modal";

const categories: EventCategory[] = ["학교 행사", "수업", "회의", "연수", "제출 및 마감", "학급 일정", "학생 관련", "학부모 관련", "개인 일정", "기타"];
const today = new Date();
const todayKey = format(today, "yyyy-MM-dd");
const sample = (id: string, offset: number, title: string, time: string, category: EventCategory, location = ""): CalendarEvent => ({ id, title, date: format(addDays(today, offset), "yyyy-MM-dd"), startTime: time, endTime: "", location, category, memo: "" });
const samples: CalendarEvent[] = [
  sample("s1", 0, "교직원 회의", "15:00", "회의", "시청각실"), sample("s2", 0, "여름방학 안전교육 연수", "18:00", "연수", "온라인(ZOOM)"),
  sample("s3", 0, "체험학습 계획서 제출", "23:59", "제출 및 마감", "이메일 제출"), sample("s4", 1, "교실혁신 연수", "13:30", "연수", "2층 컴퓨터실"),
  sample("s5", 2, "5학년 과학 실험 수업", "09:00", "수업", "과학실"), sample("s6", 5, "여름학교 운영", "09:00", "학교 행사", "체육관"),
  sample("s7", -6, "학급회의", "10:20", "학급 일정"), sample("s8", -9, "교육계획서 마감", "18:00", "제출 및 마감"),
];
const emptyDraft: EventDraft = { title: "", date: format(today, "yyyy-MM-dd"), startTime: "", endTime: "", location: "", category: "기타", memo: "", allDay: false };

export default function Dashboard() {
  const currentUser = isFirebaseConfigured ? getFirebaseServices().auth.currentUser : null;
  const userName = currentUser?.isAnonymous ? "체험 사용자" : currentUser?.displayName || currentUser?.email?.split("@")[0] || "선생님";
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(startOfMonth(today));
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [activeSection, setActiveSection] = useState<"calendar" | "today" | "upcoming" | "deadline">("calendar");
  const [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState<"message" | "photo" | "manual" | "review" | null>(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [candidates, setCandidates] = useState<EventDraft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null);

  useEffect(() => { let stop: () => void = () => undefined; subscribeToEvents(setEvents).then((unsubscribe) => { stop = unsubscribe; }).catch(() => undefined); return () => stop(); }, []);
  const visibleEvents = isFirebaseConfigured ? events : samples;
  const todayEvents = visibleEvents.filter((event) => isSameDay(parseISO(event.date), today));
  const allUpcoming = visibleEvents.filter((event) => event.date > todayKey && !event.completed).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const upcoming = allUpcoming.slice(0, 4);
  const pastEvents = visibleEvents.filter((event) => event.date < todayKey && !event.completed).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const completedEvents = visibleEvents.filter((event) => event.completed).sort((a, b) => (b.completedAt || b.date).localeCompare(a.completedAt || a.date));

  async function analyze(payload: { text?: string; image?: string; mimeType?: string }) {
    setLoading(true); setAnalyzing(true); setNotice("");
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setCandidates(data.events); setSelected(data.events.map((_: EventDraft, index: number) => index)); setModal("review");
    } catch (error) { setNotice(error instanceof Error ? error.message : "일정을 분석하지 못했습니다."); } finally { setLoading(false); setAnalyzing(false); }
  }
  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setNotice("10MB 이하 이미지를 선택해 주세요.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setNotice("PNG, JPG, WEBP 사진만 업로드할 수 있습니다.");
    setNotice("사진을 읽고 있습니다...");
    try {
      const payload = await prepareImage(file);
      await analyze(payload);
    } catch {
      setNotice("사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
    }
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault(); setLoading(true);
    try { await createEvent(draft); setModal(null); setDraft(emptyDraft); setNotice("일정을 저장했습니다."); } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setLoading(false); }
  }
  async function saveCandidates() {
    const eventsToSave = selected.map((index) => candidates[index]);
    setModal(null); setLoading(true); setMessage(""); setCandidates([]); setSelected([]);
    try { await Promise.all(eventsToSave.map((event) => createEvent(event))); setNotice(`${eventsToSave.length}개 일정을 저장했습니다.`); } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setLoading(false); }
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editTarget) return;
    setLoading(true);
    try { await updateEvent(editTarget.id, draft); setEditTarget(null); setSelectedEvent(null); setNotice("일정을 수정했습니다."); } catch (error) { setNotice(error instanceof Error ? error.message : "수정하지 못했습니다."); } finally { setLoading(false); }
  }
  function openToday() { setActiveSection("today"); setSidebar(false); }
  function openCalendar() { setActiveSection("calendar"); setSidebar(false); }
  function openUpcoming() { setActiveSection("upcoming"); setSidebar(false); }
  function openDeadline() { setActiveSection("deadline"); setSidebar(false); }
  async function toggleCompleted(event: CalendarEvent) {
    if (!isFirebaseConfigured) return setNotice("Firebase 연결 후 완료 상태를 변경할 수 있습니다.");
    const completed = !event.completed;
    setLoading(true);
    try { await updateEvent(event.id, { completed, completedAt: completed ? new Date().toISOString() : "" }); setSelectedEvent(null); setNotice(completed ? "완료한 항목으로 이동했습니다." : "미완료 상태로 되돌렸습니다."); } catch (error) { setNotice(error instanceof Error ? error.message : "완료 상태를 변경하지 못했습니다."); } finally { setLoading(false); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="sidebar-top"><Logo /><span>교사를 위한 스마트 캘린더</span><button className="mobile-close" onClick={() => setSidebar(false)} aria-label="메뉴 닫기"><X /></button></div>
      <nav aria-label="주요 메뉴">
        <button className={`nav-item ${activeSection === "calendar" ? "active" : ""}`} onClick={openCalendar}><CalendarDays />캘린더</button><button className={`nav-item ${activeSection === "today" ? "active" : ""}`} onClick={openToday}><CalendarDays />오늘의 일정</button><button className={`nav-item ${activeSection === "upcoming" ? "active" : ""}`} onClick={openUpcoming}><CalendarDays />다가오는 일정</button>
        <button className={`nav-item ${activeSection === "deadline" ? "active" : ""}`} onClick={openDeadline}><CalendarDays />마감 일정 {pastEvents.length > 0 && <b className="nav-count">{pastEvents.length}</b>}</button><button className="nav-item" onClick={() => setModal("manual")}><Plus />일정 추가</button><div className="nav-divider" />
        <button className="nav-item" onClick={() => setModal("message")}><MessageSquareText />메시지/사진 일정 추가</button><button className="nav-item" onClick={() => setModal("manual")}><Plus />직접 일정 추가</button><div className="nav-divider" />
        <button className="nav-item"><Tag />분류 관리</button><button className="nav-item"><Bell />알림 설정</button><div className="nav-divider" /><button className="nav-item"><Settings />설정</button><button className="nav-item"><CircleHelp />도움말</button>
      </nav>
      <div className="tip-card"><strong>T-Calendar 꿀팁!</strong><p>메시지를 붙여넣기만 해도<br />일정을 자동으로 찾아드려요.</p><button onClick={() => setModal("message")}>자세히 보기 <ChevronRight /></button><span>🐿️</span></div>
    </aside>
    {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="메뉴 닫기" />}
    <main>
      <header className="topbar"><button className="menu-button" onClick={() => setSidebar(true)} aria-label="메뉴 열기"><Menu /></button><div className="mobile-logo"><Logo compact /></div>
        <label className="search-box"><input placeholder="일정 검색 (예: 회의, 연수, 마감)" /><Search /></label>
        <div className="top-actions"><button className="icon-button alarm" aria-label="알림"><Bell /><i>3</i></button><button className="icon-button" aria-label="도움말"><CircleHelp /></button><button className="user-menu-button" onClick={() => currentUser && signOut(getFirebaseServices().auth)} title="로그아웃"><span className="user-avatar">{currentUser?.isAnonymous ? "👋" : "👩🏻"}</span><strong>{userName}</strong><ChevronDown /></button></div>
      </header>
      <div className="content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}><X /></button></div>}
        {activeSection === "calendar" ? <div className="workspace">
          <div className="calendar-column">
            <section className="calendar-card">
            <div className="calendar-toolbar"><div className="month-nav"><h1>{calendarView === "month" ? format(month, "yyyy년 M월") : `${format(startOfWeek(month), "M월 d일")} – ${format(endOfWeek(month), "M월 d일")}`}</h1><button onClick={() => setMonth((date) => calendarView === "month" ? subMonths(date, 1) : subWeeks(date, 1))}><ChevronLeft /></button><button onClick={() => setMonth((date) => calendarView === "month" ? addMonths(date, 1) : addWeeks(date, 1))}><ChevronRight /></button><button onClick={() => setMonth(calendarView === "month" ? startOfMonth(today) : startOfWeek(today))}>오늘</button></div>
              <div className="view-tools"><div className="view-switch"><button className={calendarView === "month" ? "active" : ""} onClick={() => { setCalendarView("month"); setMonth(startOfMonth(month)); }}>월간</button><button className={calendarView === "week" ? "active" : ""} onClick={() => { setCalendarView("week"); setMonth(startOfWeek(month)); }}>주간</button></div><button className="filter-button"><SlidersHorizontal />필터</button></div></div>
            {calendarView === "month"
              ? <MonthCalendar month={month} events={visibleEvents} onAdd={(date) => { setDraft({ ...emptyDraft, date }); setModal("manual"); }} onSelect={setSelectedEvent} />
              : <WeekCalendar week={month} events={visibleEvents} onAdd={(date) => { setDraft({ ...emptyDraft, date }); setModal("manual"); }} onSelect={setSelectedEvent} />}
            </section>
            <section className="rail-card today-card"><div className="today-heading"><div><h2>오늘의 일정</h2><p className="rail-date">{format(today, "M월 d일 (EEE)", { locale: ko })}</p></div><button className="rail-more" onClick={openToday}>전체 일정 보기 <ChevronRight /></button></div><div className="today-list">{todayEvents.map((event) => <TodayItem key={event.id} event={event} onOpen={() => setSelectedEvent(event)} />)}</div></section>
            <section className="upcoming-strip"><div className="strip-title"><h2>다가오는 일정</h2><button onClick={openUpcoming}>더보기 <ChevronRight /></button></div><div className="upcoming-list">{upcoming.map((event) => <UpcomingItem key={event.id} event={event} onOpen={() => setSelectedEvent(event)} />)}</div></section>
            {!isFirebaseConfigured && <p className="demo-note">현재 예시 일정으로 표시 중입니다. Firebase 연결 시 실제 일정이 표시됩니다.</p>}
          </div>
          <aside className="right-rail">
            <section className="rail-card quick-add"><h2>빠른 추가</h2><button onClick={() => setModal("message")}><MessageSquareText /><span><strong>메시지 붙여넣기</strong><small>일정 자동 인식</small></span><ChevronRight /></button><label><Camera /><span><strong>사진 촬영/업로드</strong><small>이미지 일정 인식</small></span><ChevronRight /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} /></label><button className="manual-add-card" onClick={() => setModal("manual")}><Plus /><span><strong>직접 입력해서 추가</strong><small>날짜와 내용을 직접 작성</small></span><ChevronRight /></button></section>
          </aside>
        </div> : activeSection === "today" ? <section className="today-page">
          <header className="today-page-header"><div><span>오늘도 좋은 하루 보내세요</span><h1>오늘의 일정</h1><p>{format(today, "yyyy년 M월 d일 EEEE", { locale: ko })}</p></div><div className="today-add-actions"><button className="today-message-button" onClick={() => setModal("message")}><MessageSquareText /> 메시지로 추가</button><label className="today-photo-button"><Camera /> 사진으로 추가<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} /></label><button className="today-add-button" onClick={() => { setDraft({ ...emptyDraft, date: format(today, "yyyy-MM-dd") }); setModal("manual"); }}><Plus /> 직접 추가</button></div></header>
          {todayEvents.length ? <div className="today-page-list">{todayEvents.map((event) => <button className={`today-page-event c-${categories.indexOf(event.category)}`} key={event.id} onClick={() => setSelectedEvent(event)}><time>{event.startTime || "종일"}{event.endTime ? ` – ${event.endTime}` : ""}</time><div><span>{shortCategory(event.category)}</span><strong>{event.title}</strong><small>{event.location || "장소 미정"}{event.memo ? ` · ${event.memo}` : ""}</small></div><ChevronRight /></button>)}</div> : <div className="today-empty"><CalendarDays /><h2>오늘 등록된 일정이 없습니다.</h2><p>새 일정을 추가하거나 메시지와 사진에서 일정을 찾아보세요.</p><button onClick={() => { setDraft({ ...emptyDraft, date: format(today, "yyyy-MM-dd") }); setModal("manual"); }}><Plus /> 일정 추가하기</button></div>}
        </section> : activeSection === "upcoming" ? <section className="upcoming-page">
          <header className="upcoming-page-header"><div><span>가까운 날짜부터 차례대로</span><h1>다가오는 일정</h1><p>일정과 해야 할 일을 마감 순서대로 확인하세요.</p></div><div className="upcoming-summary"><span><b>{allUpcoming.filter(isTaskEvent).length}</b> 해야 할 일</span><span><b>{allUpcoming.filter((event) => !isTaskEvent(event)).length}</b> 일정</span></div></header>
          {allUpcoming.length ? <div className="upcoming-columns">
            <section className="upcoming-column task-column"><header><div><span className="task-dot" /><h2>해야 할 일</h2></div><p>제출·마감·완료해야 하는 항목</p></header><div className="upcoming-page-list">{allUpcoming.filter(isTaskEvent).map((event, index) => <PriorityUpcomingItem event={event} index={index} task key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!allUpcoming.some(isTaskEvent) && <div className="upcoming-column-empty">예정된 할 일이 없습니다.</div>}</div></section>
            <section className="upcoming-column event-column"><header><div><span className="event-dot" /><h2>일정</h2></div><p>수업·회의·행사 등 예정된 일정</p></header><div className="upcoming-page-list">{allUpcoming.filter((event) => !isTaskEvent(event)).map((event, index) => <PriorityUpcomingItem event={event} index={index} key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!allUpcoming.some((event) => !isTaskEvent(event)) && <div className="upcoming-column-empty">예정된 일정이 없습니다.</div>}</div></section>
          </div> : <div className="today-empty"><CalendarDays /><h2>다가오는 일정이 없습니다.</h2><p>새 일정을 추가하면 날짜가 가까운 순서대로 표시됩니다.</p></div>}
        </section> : <section className="deadline-page">
          <header className="deadline-page-header"><div><span>지난 항목과 완료 기록</span><h1>마감 일정</h1><p>다가오는 일정과 겹치지 않도록 기간이 지난 항목과 완료한 기록만 표시합니다.</p></div><div className="deadline-summary"><span><b>{pastEvents.length}</b> 기간 지남</span><span><b>{completedEvents.length}</b> 완료</span></div></header>
          <div className="deadline-columns">
            <section className="deadline-column overdue-column"><header><div><span className="overdue-dot" /><h2>기간이 지난 항목</h2></div><p>아직 완료하지 않은 지난 일정과 할 일</p></header><div className="deadline-list">{pastEvents.map((event) => <ArchiveEventItem event={event} key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!pastEvents.length && <div className="deadline-empty">기간이 지난 미완료 항목이 없습니다.</div>}</div></section>
            <section className="deadline-column completed-column"><header><div><span className="completed-dot" /><h2>완료된 항목</h2></div><p>완료 처리한 일정과 해야 할 일</p></header><div className="deadline-list">{completedEvents.map((event) => <ArchiveEventItem event={event} completed key={event.id} onOpen={() => setSelectedEvent(event)} />)}{!completedEvents.length && <div className="deadline-empty">아직 완료된 항목이 없습니다.</div>}</div></section>
          </div>
        </section>}
      </div>
    </main>
    <Modal title="메시지에서 일정 찾기" open={modal === "message"} onClose={() => setModal(null)}><div className="modal-body"><p className="helper">받은 문자나 메신저 내용을 그대로 붙여넣으세요.</p><textarea className="modal-textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="메시지를 붙여넣어 주세요." /><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="primary-button" disabled={!message.trim() || loading} onClick={() => analyze({ text: message })}>{loading ? "분석 중..." : "일정 찾기"}</button></div></div></Modal>
    <Modal title="사진에서 일정 찾기" open={modal === "photo"} onClose={() => setModal(null)}><div className="modal-body"><label className="upload-zone"><Camera /><strong>안내문 사진을 선택해 주세요.</strong><span>PNG, JPG, WEBP · 최대 10MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImage} /></label></div></Modal>
    <Modal title="직접 일정 추가" open={modal === "manual"} onClose={() => setModal(null)}><EventForm draft={draft} setDraft={setDraft} onSubmit={saveDraft} loading={loading} /></Modal>
    <Modal title="일정 상세" open={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)}><div className="modal-body event-detail">{selectedEvent && <><div className="detail-badges"><div className={`detail-category c-${categories.indexOf(selectedEvent.category)}`}>{selectedEvent.category}</div>{selectedEvent.completed && <span className="detail-completed">완료됨</span>}</div><h3>{selectedEvent.title}</h3><dl><div><dt>날짜</dt><dd>{format(parseISO(selectedEvent.date), "yyyy년 M월 d일 (EEE)", { locale: ko })}</dd></div><div><dt>시간</dt><dd>{selectedEvent.allDay ? "종일" : `${selectedEvent.startTime || "시간 미정"}${selectedEvent.endTime ? ` – ${selectedEvent.endTime}` : ""}`}</dd></div><div><dt>장소</dt><dd>{selectedEvent.location || "장소 미정"}</dd></div><div><dt>메모</dt><dd>{selectedEvent.memo || "메모 없음"}</dd></div></dl><button className={`completion-button ${selectedEvent.completed ? "is-completed" : ""}`} disabled={loading} onClick={() => toggleCompleted(selectedEvent)}>{selectedEvent.completed ? "미완료로 되돌리기" : "완료로 표시"}</button><div className="detail-actions"><button className="detail-copy" onClick={() => { setDraft({ ...toDraft(selectedEvent), title: `${selectedEvent.title} 복사본`, completed: false, completedAt: "" }); setSelectedEvent(null); setModal("manual"); }}><Plus /> 복사하여 추가</button><button className="detail-edit" onClick={() => { setDraft(toDraft(selectedEvent)); setEditTarget(selectedEvent); setSelectedEvent(null); }}>수정</button><button className="detail-delete" onClick={() => { setDeleteTarget(selectedEvent); setSelectedEvent(null); }}>삭제</button></div></>}</div></Modal>
    <Modal title="일정 수정" open={Boolean(editTarget)} onClose={() => setEditTarget(null)}><EventForm draft={draft} setDraft={setDraft} onSubmit={saveEdit} loading={loading} submitLabel="수정 완료" /></Modal>
    <Modal title="찾은 일정 확인" open={modal === "review"} onClose={() => setModal(null)} wide><div className="modal-body"><p className="helper">날짜와 시간을 확인하고 필요한 일정만 선택하세요.</p><div className="candidate-list">{candidates.map((event, index) => <label className="candidate" key={`${event.title}-${index}`}><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])}/><div><strong>{event.title}</strong><b>{event.date || "날짜 확인 필요"} {event.startTime}</b><span>{event.location || "장소 미정"} · {event.category}</span></div></label>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>취소</button><button className="primary-button" disabled={!selected.length || loading} onClick={saveCandidates}>{selected.length}개 캘린더에 추가</button></div></div></Modal>
    <Modal title="일정을 삭제할까요?" open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}><div className="modal-body"><p><strong>{deleteTarget?.title}</strong> 일정을 삭제하면 되돌릴 수 없습니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>취소</button><button className="danger-button" onClick={async () => { if (deleteTarget && isFirebaseConfigured) await removeEvent(deleteTarget.id); setDeleteTarget(null); }}>삭제</button></div></div></Modal>
    {analyzing && <div className="analysis-loading" role="status" aria-live="polite"><div className="analysis-loading-card"><div className="analysis-spinner"><span /></div><strong>AI가 일정을 찾고 있어요</strong><p>사진 속 날짜와 내용을 분석하고 있습니다.<br />잠시만 기다려 주세요.</p><div className="analysis-progress"><i /></div></div></div>}
  </div>;
}

function MonthCalendar({ month, events, onAdd, onSelect }: { month: Date; events: CalendarEvent[]; onAdd: (date: string) => void; onSelect: (event: CalendarEvent) => void }) {
  const cells = useMemo(() => { const from = startOfWeek(startOfMonth(month)); const to = endOfWeek(endOfMonth(month)); const result: Date[] = []; for (let day = from; day <= to; day = addDays(day, 1)) result.push(day); return result; }, [month]);
  return <div className="month-calendar"><div className="weekday-row">{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <span className={index === 0 ? "sun" : index === 6 ? "sat" : ""} key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day) => { const dayEvents = events.filter((event) => event.date === format(day, "yyyy-MM-dd")); return <div key={day.toISOString()} className={`day-cell ${dayEvents.length > 1 ? "has-multiple" : ""} ${!isSameMonth(day, month) ? "outside" : ""} ${isSameDay(day, today) ? "selected" : ""}`} onDoubleClick={() => onAdd(format(day, "yyyy-MM-dd"))}><span className="day-number">{format(day, "d")}</span><div className="cell-events">{dayEvents.slice(0, 2).map((event) => <button className={`cell-event c-${categories.indexOf(event.category)}`} key={event.id} onDoubleClick={(click) => click.stopPropagation()} onClick={() => onSelect(event)}><b>{shortCategory(event.category)}</b><small>{event.startTime}</small><em>{event.title}</em></button>)}{dayEvents.length > 2 && <span className="more-events">+{dayEvents.length - 2}개 더보기</span>}</div></div>; })}</div></div>;
}
function WeekCalendar({ week, events, onAdd, onSelect }: { week: Date; events: CalendarEvent[]; onAdd: (date: string) => void; onSelect: (event: CalendarEvent) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(week), index));
  return <div className="week-calendar">{days.map((day, index) => { const dayEvents = events.filter((event) => event.date === format(day, "yyyy-MM-dd")); return <section className={`week-day ${isSameDay(day, today) ? "is-today" : ""}`} key={day.toISOString()}><button className="week-day-heading" onDoubleClick={() => onAdd(format(day, "yyyy-MM-dd"))}><span className={index === 0 ? "sun" : index === 6 ? "sat" : ""}>{format(day, "EEE", { locale: ko })}</span><strong>{format(day, "d")}</strong></button><div className="week-events">{dayEvents.length ? dayEvents.map((event) => <button className={`week-event c-${categories.indexOf(event.category)}`} key={event.id} onClick={() => onSelect(event)}><span><b>{shortCategory(event.category)}</b>{event.startTime || "종일"}</span><strong>{event.title}</strong><small>{event.location || "장소 미정"}</small></button>) : <button className="week-empty" onClick={() => onAdd(format(day, "yyyy-MM-dd"))}><Plus /> 일정 추가</button>}</div></section>; })}</div>;
}
function shortCategory(category: EventCategory) { return category === "제출 및 마감" ? "마감" : category.replace("학교 ", ""); }
function isTaskEvent(event: CalendarEvent) {
  return event.category === "제출 및 마감" || /제출|마감|과제|완료|준비|신청|보고서|계획서/.test(`${event.title} ${event.memo}`);
}
function toDraft(event: CalendarEvent): EventDraft {
  const { title, date, startTime, endTime, location, category, memo, allDay, completed, completedAt } = event;
  return { title, date, startTime, endTime, location, category, memo, allDay, completed, completedAt };
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
function TodayItem({ event, onOpen }: { event: CalendarEvent; onOpen: () => void }) { return <button className={`today-item c-${categories.indexOf(event.category)}`} onClick={onOpen}><div><span><b>{shortCategory(event.category)}</b>{event.startTime}</span><strong>{event.title}</strong><small>{event.location || "장소 미정"}</small></div><ChevronRight /></button>; }
function UpcomingItem({ event, onOpen }: { event: CalendarEvent; onOpen: () => void }) { return <button onClick={onOpen}><span className={`upcoming-badge c-${categories.indexOf(event.category)}`}>{shortCategory(event.category)}</span><time>{format(parseISO(event.date), "M.d (EEE)", { locale: ko })} {event.startTime}</time><strong>{event.title}</strong><small>{event.location || "장소 미정"}</small></button>; }
function PriorityUpcomingItem({ event, index, task = false, onOpen }: { event: CalendarEvent; index: number; task?: boolean; onOpen: () => void }) {
  const daysLeft = differenceInCalendarDays(parseISO(event.date), today);
  return <button className={`upcoming-page-event ${task ? "is-task" : "is-event"}`} onClick={onOpen}><span className="priority-number">{index + 1}</span><div className="upcoming-date"><b>{daysLeft === 1 ? "내일" : `D-${daysLeft}`}</b><time>{format(parseISO(event.date), "M월 d일 (EEE)", { locale: ko })}</time></div><div className="upcoming-main"><span className="upcoming-type">{task ? "해야 할 일" : "일정"}</span><strong>{event.title}</strong><small>{event.startTime || "시간 미정"} · {event.location || "장소 미정"}{event.memo ? ` · ${event.memo}` : ""}</small></div><ChevronRight /></button>;
}
function ArchiveEventItem({ event, completed = false, onOpen }: { event: CalendarEvent; completed?: boolean; onOpen: () => void }) {
  const type = isTaskEvent(event) ? "해야 할 일" : "일정";
  return <button className={`archive-event ${completed ? "is-completed" : "is-overdue"}`} onClick={onOpen}><div className="archive-status"><span>{completed ? "완료" : "기간 지남"}</span><time>{format(parseISO(event.date), "yyyy.MM.dd (EEE)", { locale: ko })}</time></div><div className="archive-main"><span>{type}</span><strong>{event.title}</strong><small>{event.startTime || "시간 미정"} · {event.location || "장소 미정"}</small></div><ChevronRight /></button>;
}
function EventForm({ draft, setDraft, onSubmit, loading, submitLabel = "일정 저장" }: { draft: EventDraft; setDraft: (draft: EventDraft) => void; onSubmit: (event: FormEvent) => void; loading: boolean; submitLabel?: string }) { const change = (key: keyof EventDraft, value: string | boolean) => setDraft({ ...draft, [key]: value }); return <form className="modal-body form-grid" onSubmit={onSubmit}><label className="full">일정 제목<input required value={draft.title} onChange={(e) => change("title", e.target.value)} placeholder="일정 제목" /></label><label>날짜<input required type="date" value={draft.date} onChange={(e) => change("date", e.target.value)} /></label><label>분류<select value={draft.category} onChange={(e) => change("category", e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>시작 시간<input type="time" value={draft.startTime} onChange={(e) => change("startTime", e.target.value)} /></label><label>종료 시간<input type="time" value={draft.endTime} onChange={(e) => change("endTime", e.target.value)} /></label><label className="full">장소<input value={draft.location} onChange={(e) => change("location", e.target.value)} placeholder="장소" /></label><label className="full">메모<textarea value={draft.memo} onChange={(e) => change("memo", e.target.value)} /></label><div className="modal-actions full"><button type="submit" className="primary-button" disabled={loading}>{loading ? "저장 중..." : submitLabel}</button></div></form>; }
