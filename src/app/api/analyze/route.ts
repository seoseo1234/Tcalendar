import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const schema = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD, 불확실하면 빈 문자열" },
          endDate: { type: "string", description: "여러 날 일정의 마지막 날짜(YYYY-MM-DD). 하루 일정이거나 불확실하면 빈 문자열" },
          startTime: { type: "string", description: "HH:mm, 없으면 빈 문자열" },
          endTime: { type: "string", description: "HH:mm, 없으면 빈 문자열" },
          location: { type: "string" },
          category: { type: "string", enum: ["학교 행사", "수업", "회의", "연수", "제출 및 마감", "학급 일정", "학생 관련", "학부모 관련", "개인 일정", "기타"] },
          memo: { type: "string" },
          confidence: { type: "string", enum: ["높음", "보통", "낮음"] },
          allDay: { type: "boolean" },
        },
        required: ["title", "date", "endDate", "startTime", "endTime", "location", "category", "memo", "confidence", "allDay"],
      },
    },
  },
  required: ["events"],
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTemporaryGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|fetch failed/i.test(message);
}

type ExtractedEvent = Record<string, string | boolean>;

function normalizeTitle(value = "") {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/\d+교시/g, "").replace(/초등|중등|고등|\d+학년|\d+반/g, "")
    .replace(/(정규)?수업|교과|과목|일정|시간/g, "");
}

function getSubject(value = "") {
  const normalized = normalizeTitle(value);
  return ["국어", "수학", "사회", "과학", "영어", "도덕", "체육", "음악", "미술", "실과", "창체"].find((subject) => normalized.includes(subject)) || "";
}

function sameExtractedEvent(left: ExtractedEvent, right: ExtractedEvent) {
  const rawLeftTitle = String(left.title || "").toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  const rawRightTitle = String(right.title || "").toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  if (rawLeftTitle && rawLeftTitle === rawRightTitle) {
    return Boolean(left.date && left.date === right.date && String(left.endDate || "") === String(right.endDate || ""));
  }
  if (!left.date || left.date !== right.date || String(left.endDate || "") !== String(right.endDate || "")) return false;
  const leftTitle = normalizeTitle(String(left.title || ""));
  const rightTitle = normalizeTitle(String(right.title || ""));
  const leftSubject = getSubject(leftTitle);
  return Boolean(
    (leftTitle && leftTitle === rightTitle)
    || (leftSubject && leftSubject === getSubject(rightTitle))
  );
}

function mergeExtractedEvents(left: ExtractedEvent, right: ExtractedEvent) {
  const richer = [right.startTime, right.endTime, right.location, right.memo].filter(Boolean).length
    > [left.startTime, left.endTime, left.location, left.memo].filter(Boolean).length ? right : left;
  const other = richer === left ? right : left;
  return {
    ...richer,
    endDate: richer.endDate || other.endDate || "",
    startTime: richer.startTime || other.startTime,
    endTime: richer.endTime || other.endTime,
    location: richer.location || other.location,
    memo: richer.memo || other.memo,
  };
}

function deduplicateEvents(events: ExtractedEvent[]) {
  return events.reduce<ExtractedEvent[]>((unique, event) => {
    const duplicateIndex = unique.findIndex((saved) => sameExtractedEvent(event, saved));
    if (duplicateIndex < 0) unique.push(event);
    else unique[duplicateIndex] = mergeExtractedEvents(unique[duplicateIndex], event);
    return unique;
  }, []);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

  try {
    const { text, image, mimeType, files, schoolSettings } = await request.json();
    const uploadedFiles: { data: string; mimeType: string }[] = Array.isArray(files)
      ? files
      : image ? [{ data: image, mimeType: mimeType || "image/jpeg" }] : [];
    if (!text && !uploadedFiles.length) return NextResponse.json({ error: "분석할 내용을 입력해 주세요." }, { status: 400 });
    if (uploadedFiles.length > 10) return NextResponse.json({ error: "파일은 한 번에 최대 10개까지 분석할 수 있습니다." }, { status: 400 });
    if (uploadedFiles.some((file) => !file?.data || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.mimeType))) {
      return NextResponse.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const today = new Date().toISOString().slice(0, 10);
    const periodGuide = Array.isArray(schoolSettings?.periods) ? schoolSettings.periods.map((time: string, index: number) => `${index + 1}교시 ${time}`).join(", ") : "";
    const instruction = `당신은 한국 학교 교사를 위한 일정 추출 도우미입니다. 오늘은 ${today}입니다. 입력에서 모든 일정을 찾아 구조화하세요. 여행, 출장, 캠프, 연수처럼 시작일과 종료일이 있는 일정은 date에 시작일, endDate에 마지막 날짜를 넣어 하나의 기간 일정으로 반환하세요. 하루 일정은 endDate를 빈 문자열로 반환하고, 기간을 여러 개의 하루 일정으로 나누지 마세요. 학교 교시 시작 시간은 ${periodGuide || "설정되지 않음"}이고, 시간이 없는 마감 일정의 기본 시간은 ${schoolSettings?.defaultDeadline || "17:00"}입니다. 교시 표현이 있으면 이 설정을 적용하세요. 시간표 이미지는 날짜 열과 교시 행을 함께 읽고, 하나의 표 셀을 정확히 하나의 일정으로 만드세요. 같은 날짜와 같은 교과가 "국어", "국어 수업", "1교시 국어"처럼 표현만 달리해 반복 인식되면 하나로 합치고 절대 중복해서 반환하지 마세요. 단, 날짜가 다른 같은 교과 수업은 각각 별도 일정입니다. 여러 이미지나 여러 PDF 페이지에 같은 일정이 반복되어도 하나로 합치세요. 상대 날짜를 실제 날짜로 바꾸고, 추측이 필요한 날짜는 비워 두며 신뢰도를 낮음으로 표시하세요. 기술 용어 없이 자연스러운 한국어 제목을 만드세요.`;
    const contents = uploadedFiles.length
      ? [{ text: instruction }, ...uploadedFiles.map((file) => ({ inlineData: { data: file.data, mimeType: file.mimeType } }))]
      : `${instruction}\n\n원본 메시지:\n${text}`;

    const primaryModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const models = uploadedFiles.length
      ? [...new Set(["gemini-3.5-flash-lite", primaryModel])]
      : [...new Set([primaryModel, "gemini-3.5-flash-lite"])];
    let response;
    let lastError: unknown;

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await ai.models.generateContent({
            model,
            contents,
            config: { responseMimeType: "application/json", responseJsonSchema: schema },
          });
          break;
        } catch (error) {
          lastError = error;
          if (!isTemporaryGeminiError(error)) throw error;
          if (attempt === 0) await delay(800);
        }
      }
      if (response) break;
    }

    if (!response) throw lastError;
    const parsed = JSON.parse(response.text || '{"events":[]}');
    const normalizedEvents = (Array.isArray(parsed.events) ? parsed.events : []).map((event: ExtractedEvent) => ({
      ...event,
      endDate: event.endDate && event.date && String(event.endDate) >= String(event.date) ? event.endDate : "",
    }));
    return NextResponse.json({ ...parsed, events: deduplicateEvents(normalizedEvents) });
  } catch (error) {
    const message = isTemporaryGeminiError(error)
      ? "AI 일정 분석 서비스가 잠시 혼잡합니다. 잠시 후 다시 시도해 주세요."
      : error instanceof Error ? error.message : "일정을 분석하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
