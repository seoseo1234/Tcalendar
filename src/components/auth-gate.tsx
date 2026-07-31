"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type User,
} from "firebase/auth";
import { CalendarDays, Check, Eye, EyeOff, ImagePlus, MessageSquareText, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase";
import Dashboard from "@/components/dashboard";
import { Logo } from "@/components/logo";

type AuthMode = "login" | "signup";

const authMessages: Record<string, string> = {
  "auth/email-already-in-use": "이미 가입된 이메일입니다.",
  "auth/invalid-credential": "아이디 또는 비밀번호가 올바르지 않습니다.",
  "auth/invalid-email": "올바른 이메일 주소를 입력해 주세요.",
  "auth/popup-closed-by-user": "Google 로그인 창이 닫혔습니다.",
  "auth/popup-blocked": "브라우저가 Google 로그인 창을 차단했습니다.",
  "auth/unauthorized-domain": "현재 주소가 Firebase의 승인된 도메인에 등록되지 않았습니다.",
  "auth/too-many-requests": "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
  "auth/weak-password": "비밀번호는 6자 이상으로 입력해 주세요.",
  "auth/operation-not-allowed": "Firebase 콘솔에서 해당 로그인 방식을 활성화해 주세요.",
};

function friendlyAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return authMessages[code] || "로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function shouldUseRedirect() {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return mobileUserAgent || standalone;
}

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<"email" | "google" | "guest" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setChecking(false);
      return;
    }
    const { auth } = getFirebaseServices();
    void getRedirectResult(auth).catch((authError) => {
      setError(friendlyAuthError(authError));
      setLoading(null);
    });
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setChecking(false);
      if (nextUser) setLoading(null);
    });
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setLoading("email");
    setError("");
    try {
      const { auth } = getFirebaseServices();
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setLoading(null);
    }
  }

  async function continueWithGoogle() {
    setLoading("google");
    setError("");
    try {
      const { auth } = getFirebaseServices();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      if (shouldUseRedirect()) {
        await signInWithRedirect(auth, provider);
        return;
      }

      try {
        await signInWithPopup(auth, provider);
      } catch (authError) {
        const code = typeof authError === "object" && authError && "code" in authError ? String(authError.code) : "";
        if (code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw authError;
      }
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setLoading(null);
    }
  }

  async function continueAsGuest() {
    setLoading("guest");
    setError("");
    try {
      const { auth } = getFirebaseServices();
      await signInAnonymously(auth);
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setLoading(null);
    }
  }

  if (checking) return <div className="auth-loading"><div className="auth-spinner" /><span>캘린더를 준비하고 있어요</span></div>;
  if (user) return <Dashboard />;

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand"><Logo /><span>교사를 위한 스마트 캘린더</span></div>
        <div className="auth-copy">
          <span className="auth-kicker"><Sparkles /> AI로 더 간편한 일정 관리</span>
          <h1>놓치기 쉬운 학교 일정,<br /><em>한곳에서 편하게</em> 관리하세요.</h1>
          <p>메시지나 안내문 사진만 올리면 AI가 일정을 찾아<br />캘린더에 깔끔하게 정리해 드려요.</p>
          <ul>
            <li><MessageSquareText /><span><strong>메시지 자동 인식</strong><small>받은 내용을 붙여넣으면 일정으로 변환</small></span><Check /></li>
            <li><ImagePlus /><span><strong>안내문 사진 분석</strong><small>사진 속 날짜와 장소를 빠르게 확인</small></span><Check /></li>
            <li><CalendarDays /><span><strong>한눈에 보는 교사 일정</strong><small>수업, 회의, 마감 일정을 한곳에서 관리</small></span><Check /></li>
          </ul>
        </div>
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Logo compact /><strong>T-Calendar</strong></div>
          <header>
            <span>{mode === "login" ? "다시 만나서 반가워요 👋" : "T-Calendar에 오신 걸 환영해요 ✨"}</span>
            <h2>{mode === "login" ? "로그인" : "회원가입"}</h2>
            <p>{mode === "login" ? "내 캘린더에서 오늘의 일정을 확인해 보세요." : "간단한 정보로 나만의 캘린더를 시작하세요."}</p>
          </header>

          <div className="auth-tabs" role="tablist">
            <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>로그인</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>회원가입</button>
          </div>

          <button className="google-login" onClick={continueWithGoogle} disabled={Boolean(loading)}>
            <b>G</b>{loading === "google" ? "Google 연결 중..." : "Google로 계속하기"}
          </button>

          <div className="auth-divider"><span>또는 아이디로 계속</span></div>

          <form className="auth-form" onSubmit={submitEmail}>
            {mode === "signup" && <label>이름<input value={name} onChange={(event) => setName(event.target.value)} placeholder="이름을 입력해 주세요" autoComplete="name" /></label>}
            <label>아이디 <small>(이메일)</small><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@example.com" autoComplete="email" /></label>
            <label>비밀번호<div className="password-field"><input required minLength={6} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6자 이상 입력해 주세요" autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={Boolean(loading)}>{loading === "email" ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}</button>
          </form>

          <button className="guest-login" onClick={continueAsGuest} disabled={Boolean(loading)}>
            {loading === "guest" ? "체험 계정 준비 중..." : "로그인 없이 체험하기"}<span>→</span>
          </button>
          <p className="guest-note">체험 중 만든 일정은 현재 브라우저에서만 사용할 수 있어요.</p>
        </div>
      </section>
    </main>
  );
}
