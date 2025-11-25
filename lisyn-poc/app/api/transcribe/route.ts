import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Ingen ljudfil mottagen." },
        { status: 400 }
      );
    }

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: "sv", // force Swedish
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: "Kunde inte transkribera ljudet." },
      { status: 500 }
    );
  }
}

