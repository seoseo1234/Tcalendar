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
import { signInAnonymously } from "firebase/auth";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase";
import type { CalendarEvent, EventDraft } from "@/types/calendar";

async function getUserId() {
  if (!isFirebaseConfigured) throw new Error("Firebase 환경변수를 먼저 설정해 주세요.");
  const { auth } = getFirebaseServices();
  if (auth.currentUser) return auth.currentUser.uid;
  return (await signInAnonymously(auth)).user.uid;
}

async function getEventsRef() {
  const { db } = getFirebaseServices();
  return collection(db, "users", await getUserId(), "events");
}

export async function subscribeToEvents(onChange: (events: CalendarEvent[]) => void) {
  if (!isFirebaseConfigured) return () => undefined;
  const eventsRef = await getEventsRef();
  return onSnapshot(
    query(eventsRef, orderBy("date", "asc")),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CalendarEvent)),
    () => onChange([]),
  );
}

export async function createEvent(event: EventDraft) {
  return addDoc(await getEventsRef(), { ...event, createdAt: new Date().toISOString() });
}

export async function updateEvent(id: string, event: Partial<EventDraft>) {
  const { db } = getFirebaseServices();
  return updateDoc(doc(db, "users", await getUserId(), "events", id), event);
}

export async function removeEvent(id: string) {
  const { db } = getFirebaseServices();
  return deleteDoc(doc(db, "users", await getUserId(), "events", id));
}

export async function removeAllEvents() {
  const { db } = getFirebaseServices();
  const snapshot = await getDocs(await getEventsRef());
  for (let start = 0; start < snapshot.docs.length; start += 500) {
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + 500).forEach((event) => batch.delete(event.ref));
    await batch.commit();
  }
  return snapshot.size;
}
