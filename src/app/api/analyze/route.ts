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
          startTime: { type: "string", description: "HH:mm, 없으면 빈 문자열" },
          endTime: { type: "string", description: "HH:mm, 없으면 빈 문자열" },
          location: { type: "string" },
          category: { type: "string", enum: ["학교 행사", "수업", "회의", "연수", "제출 및 마감", "학급 일정", "학생 관련", "학부모 관련", "개인 일정", "기타"] },
          memo: { type: "string" },
          confidence: { type: "string", enum: ["높음", "보통", "낮음"] },
          allDay: { type: "boolean" },
        },
        required: ["title", "date", "startTime", "endTime", "location", "category", "memo", "confidence", "allDay"],
      },
    },
  },
  required: ["events"],
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

  try {
    const { text, image, mimeType } = await request.json();
    if (!text && !image) return NextResponse.json({ error: "분석할 내용을 입력해 주세요." }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey });
    const today = new Date().toISOString().slice(0, 10);
    const instruction = `당신은 한국 학교 교사를 위한 일정 추출 도우미입니다. 오늘은 ${today}입니다. 입력에서 모든 일정을 찾아 구조화하세요. 상대 날짜를 실제 날짜로 바꾸고, 추측이 필요한 날짜는 비워 두며 신뢰도를 낮음으로 표시하세요. 기술 용어 없이 자연스러운 한국어 제목을 만드세요.`;
    const contents = image
      ? [{ text: instruction }, { inlineData: { data: image, mimeType: mimeType || "image/jpeg" } }]
      : `${instruction}\n\n원본 메시지:\n${text}`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents,
      config: { responseMimeType: "application/json", responseJsonSchema: schema },
    });

    return NextResponse.json(JSON.parse(response.text || '{"events":[]}'));
  } catch (error) {
    const message = error instanceof Error ? error.message : "일정을 분석하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
