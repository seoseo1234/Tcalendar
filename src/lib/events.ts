import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase";
import type { CalendarEvent, EventDraft } from "@/types/calendar";

async function getUserId() {
  if (!isFirebaseConfigured) throw new Error("Firebase 환경변수를 먼저 설정해 주세요.");
  const { auth } = getFirebaseServices();
  if (!auth.currentUser) throw new Error("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
  return auth.currentUser.uid;
}

async function getEventsRef() {
  const { db } = getFirebaseServices();
  return collection(db, "users", await getUserId(), "events");
}

export async function subscribeToEvents(onChange: (events: CalendarEvent[]) => void, onError?: (error: Error) => void) {
  if (!isFirebaseConfigured) return () => undefined;
  const eventsRef = await getEventsRef();
  return onSnapshot(
    query(eventsRef, orderBy("date", "asc")),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CalendarEvent)),
    (error) => onError?.(error),
  );
}

function withWriteTimeout<T>(operation: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("서버 연결이 지연되고 있습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.")),
      15_000,
    );
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function createEvent(event: EventDraft) {
  return withWriteTimeout(addDoc(await getEventsRef(), { ...event, createdAt: new Date().toISOString() }));
}

export async function updateEvent(id: string, event: Partial<EventDraft>) {
  const { db } = getFirebaseServices();
  return withWriteTimeout(updateDoc(doc(db, "users", await getUserId(), "events", id), event));
}

export async function removeEvent(id: string) {
  const { db } = getFirebaseServices();
  return withWriteTimeout(deleteDoc(doc(db, "users", await getUserId(), "events", id)));
}

export async function removeEvents(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return 0;
  const { db } = getFirebaseServices();
  const userId = await getUserId();
  for (let start = 0; start < uniqueIds.length; start += 500) {
    const batch = writeBatch(db);
    uniqueIds.slice(start, start + 500).forEach((id) => {
      batch.delete(doc(db, "users", userId, "events", id));
    });
    await withWriteTimeout(batch.commit());
  }
  return uniqueIds.length;
}

export async function removeAllEvents() {
  const snapshot = await withWriteTimeout(getDocs(await getEventsRef()));
  return removeEvents(snapshot.docs.map((event) => event.id));
}
