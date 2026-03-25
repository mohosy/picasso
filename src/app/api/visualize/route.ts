import { NextRequest } from "next/server";
import { streamVisualAnswer } from "@/lib/claude";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { query, image, history, thinking } = body as {
    query?: string;
    image?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    thinking?: boolean;
  };

  if (!query && !image) {
    return Response.json(
      { error: "Please provide a question or an image." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamVisualAnswer(query || "", image, history, thinking)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to generate visual answer";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message })}\n\n`
          )
        );
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
