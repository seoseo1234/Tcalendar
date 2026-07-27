# T-Calendar

교사가 받은 메시지와 안내문 사진에서 Gemini가 일정을 찾아주고, 확인한 일정을 Firebase Firestore에 저장하는 반응형 대시보드입니다.

## 로컬 설정

1. `.env.example`을 `.env.local`로 복사합니다.
2. Google AI Studio에서 발급한 `GEMINI_API_KEY`를 입력합니다.
3. Firebase 콘솔에서 웹 앱을 만들고 `NEXT_PUBLIC_FIREBASE_*` 값을 입력합니다.
4. Firebase Authentication의 로그인 제공업체에서 **익명** 로그인을 활성화합니다.
5. Firestore Database를 만들고 [firestore.rules](./firestore.rules)의 규칙을 배포합니다.
6. 아래 명령으로 실행합니다.

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 환경변수

- `GEMINI_API_KEY`: 서버에서만 사용하는 Gemini API 키
- `GEMINI_MODEL`: 기본값 `gemini-2.5-flash`
- `NEXT_PUBLIC_FIREBASE_*`: Firebase 웹 앱 설정

Gemini 키는 브라우저로 전달되지 않습니다. 업로드한 이미지는 요청 중 인라인으로 분석하며 Firebase Storage나 로컬 파일에 저장하지 않습니다. 일정은 익명 사용자 UID별 `users/{uid}/events` 경로에 분리 저장됩니다.
