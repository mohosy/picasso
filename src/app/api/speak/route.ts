import { NextRequest, NextResponse } from "next/server";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs "Rachel"

// Allowlist of valid ElevenLabs voice IDs to prevent abuse
const ALLOWED_VOICE_IDS = new Set([
  "21m00Tcm4TlvDq8ikWAM", // Rachel
  "ErXwobaYiN019PkySvjV", // Antoni
  "TxGEqnHWrfWFTfGW9XjX", // Josh
  "EXAVITQu4vr4xnSDxMaL", // Bella
  "MF3mGyEYCl7XYWbV9V6O", // Elli
  "pNInz6obpgDQGcFmaJgB", // Adam
  "jsCqWAovK2LkecY7zXl4", // Freya
]);

export async function POST(req: NextRequest) {
  const { text, voiceId } = await req.json();

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not set" },
      { status: 500 }
    );
  }

  const resolvedVoiceId = voiceId && ALLOWED_VOICE_IDS.has(voiceId) ? voiceId : DEFAULT_VOICE_ID;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
        speed: 1.2,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("ElevenLabs error:", err);
    return NextResponse.json({ error: "TTS request failed" }, { status: 502 });
  }

  const audio = await response.arrayBuffer();

  return new NextResponse(audio, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
