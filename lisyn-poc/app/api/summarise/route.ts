import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript: string = body.transcript;

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Ingen transkription mottagen." },
        { status: 400 }
      );
    }

    const prompt = `
Du är ett verktyg som hjälper svensk vårdpersonal på äldreboenden att skriva korrekta vårdanteckningar.

Du får en transkription av ett samtal mellan personal och boende (eventuellt anhörig).
Din uppgift:

1. Använd transkriptionen (på svenska) som enda källa.
2. Skapa en strukturerad vårdanteckning på svenska.
3. Hitta inte på information. Använd bara det som faktiskt står i transkriptionen.
4. Om någon del inte nämns i samtalet ska du skriva "Inte diskuterat under detta besök".

Returnera SVARET som giltig JSON med detta format:

{
  "summary": "kort sammanfattning på svenska, 2–4 meningar",
  "sections": {
    "patient_profile": "kort beskrivning av patienten",
    "complaints": "vilka besvär och problem nämns",
    "observations": "observationer om hälsa, beteende, miljö",
    "actions": "vad personalen gjorde under besöket",
    "risks": "eventuella risker eller varningssignaler",
    "follow_up": "förslag på uppföljning eller åtgärder"
  }
}

Inget annat än JSON.
`;

    const input = `${prompt}\n\nTranskription:\n"""${transcript}"""`;

    const result = await geminiModel.generateContent(input);
    const text = result.response.text().trim();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const cleaned = text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      json = JSON.parse(cleaned);
    }

    return NextResponse.json(json);
  } catch (err: any) {
    console.error("Summarise error:", err);
    return NextResponse.json(
      { error: "Kunde inte skapa sammanfattning." },
      { status: 500 }
    );
  }
}

