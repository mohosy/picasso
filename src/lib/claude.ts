import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompts";
import { DrawingPhase, SceneStep } from "./schema";

const anthropic = new Anthropic();

// Cached system message — reused across all requests for prompt caching
const SYSTEM_MESSAGE: Anthropic.Messages.TextBlockParam & { cache_control: { type: "ephemeral" } } = {
  type: "text",
  text: SYSTEM_PROMPT,
  cache_control: { type: "ephemeral" },
};

/**
 * Sanitize AI-generated SVG content — strip dangerous elements and attributes.
 */
function sanitizeSVG(raw: string): string {
  // Remove script/style/image/use tags and their content
  let svg = raw.replace(/<\s*(script|style|image|use|foreignObject)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "");
  // Remove self-closing versions
  svg = svg.replace(/<\s*(script|style|image|use|foreignObject)[^>]*\/?\s*>/gi, "");
  // Remove event handlers (onload, onclick, onerror, etc.)
  svg = svg.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Remove javascript: URIs
  svg = svg.replace(/(href|xlink:href)\s*=\s*"javascript:[^"]*"/gi, "");
  svg = svg.replace(/(href|xlink:href)\s*=\s*'javascript:[^']*'/gi, "");
  // Remove xmlns attributes on inner elements (renderer adds the wrapper)
  svg = svg.replace(/\s+xmlns(?::\w+)?\s*=\s*"[^"]*"/gi, "");
  return svg.trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePhase(raw: any, index: number): DrawingPhase {
  const phase = { ...raw };
  phase.id = phase.id || `ph-${index}-${Math.random().toString(36).slice(2, 6)}`;
  phase.narration = phase.narration || "";
  if (phase.strokes && typeof phase.strokes === "string") {
    phase.strokes = sanitizeSVG(phase.strokes);
  } else {
    phase.strokes = "";
  }
  // Default camera: full canvas
  if (!phase.camera) {
    phase.camera = { x: 0, y: 0, width: 800, height: 400 };
  }
  return phase as DrawingPhase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStep(raw: any, stepIndex: number): SceneStep {
  const step = { ...raw };
  if (!step.stepNumber) step.stepNumber = stepIndex + 1;
  if (!Array.isArray(step.phases)) step.phases = [];
  step.phases = step.phases.map((p: unknown, i: number) => normalizePhase(p, i));
  return step as SceneStep;
}

// --- Streaming ---

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "acknowledgment"; text: string }
  | { type: "header"; title: string }
  | { type: "step"; step: SceneStep }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Extract complete step objects from a partially-streamed JSON string.
 * Uses bracket counting with proper string/escape handling.
 */
function extractStepsFromPartial(text: string, alreadyFound: number): unknown[] {
  const stepsKeyIdx = text.indexOf('"steps"');
  if (stepsKeyIdx === -1) return [];
  const arrayStart = text.indexOf("[", stepsKeyIdx);
  if (arrayStart === -1) return [];

  const results: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let found = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        found++;
        if (found > alreadyFound) {
          try {
            results.push(JSON.parse(text.substring(objStart, i + 1)));
          } catch {
            // Incomplete JSON — will be picked up next time
          }
        }
        objStart = -1;
      }
    }
  }

  return results;
}

/**
 * Classify query complexity to pick the right token budget.
 */
function classifyComplexity(query: string): "quick" | "medium" | "deep" {
  const q = query.toLowerCase().trim();
  const wordCount = q.split(/\s+/).length;

  const quickPatterns =
    /\b(weather|temperature|forecast|score|price|stock|capital of|population of|time in|who won|who is|what is the|how tall|how old|how much|how many|when did|when is|when was|where is|where was|define |what does .{1,20} mean)\b/i;

  if (wordCount <= 8 && quickPatterns.test(q)) return "quick";

  const deepPatterns =
    /\b(explain .{10,}|how does .{10,} work|in detail|step by step|compare and contrast|history of|process of|mechanism|photosynthesis|evolution|quantum|relativity|algorithm|architecture|life cycle|anatomy)\b/i;

  if (deepPatterns.test(q) || wordCount > 20) return "deep";

  return "medium";
}

/**
 * Generate a quick spoken acknowledgment based on the query.
 */
function generateAcknowledgment(query: string): string {
  const q = query.toLowerCase();
  if (/weather|temperature|forecast/.test(q)) return "Let me check the weather for you.";
  if (/score|game|match|won/.test(q)) return "Let me look up the latest on that.";
  if (/price|stock|cost|worth/.test(q)) return "Let me check the latest prices.";
  if (/news|happening|update|going on/.test(q)) return "Let me see what's going on.";
  if (/compare|difference|versus|vs/.test(q)) return "Let me compare those for you.";
  if (/how does|how do|how is/.test(q)) return "Great question! Let me break this down.";
  if (/what is|what are|what's|define/.test(q)) return "Let me show you.";
  if (/why|explain|tell me/.test(q)) return "Let me break that down for you.";
  if (/who is|who was|who are/.test(q)) return "Let me look into that.";
  if (/where|location|find/.test(q)) return "Let me find that for you.";
  return "Let me think about that.";
}

/**
 * Check if a query likely needs real-time information.
 */
function mightNeedSearch(query: string): boolean {
  const patterns =
    /\b(today|tonight|yesterday|tomorrow|current(ly)?|latest|recent(ly)?|right now|this week|this month|this year|202[4-9]|weather|forecast|news|headline|score|price|stock|market|happening|update|election|who won|who is winning|trending|live|breaking)\b/i;
  return patterns.test(query);
}

/**
 * Use Claude with web search to fetch real-time context for a query.
 */
async function searchForContext(query: string, signal?: AbortSignal): Promise<string | null> {
  try {
    console.log("[search] Starting web search for:", query);
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search" } as any],
      messages: [
        {
          role: "user",
          content: `Search the web and give a concise factual answer with specific data, numbers, and facts. 2-3 sentences max.\n\nQuestion: ${query}`,
        },
      ],
    }, { signal });

    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );
    if (textBlocks.length > 0) {
      const result = textBlocks.map((b) => b.text).join("\n");
      console.log("[search] Got context:", result.substring(0, 200));
      return result;
    }
    return null;
  } catch (err) {
    console.error("[search] Web search failed:", err);
    return null;
  }
}

export async function* streamVisualAnswer(
  query: string,
  imageBase64?: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  thinking?: boolean
): AsyncGenerator<StreamEvent> {
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (imageBase64) {
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
      "image/jpeg";
    if (imageBase64.startsWith("iVBOR")) mediaType = "image/png";

    userContent.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: imageBase64 },
    });
  }

  // Immediate spoken acknowledgment — fires before any processing
  if (query) {
    yield { type: "acknowledgment", text: generateAcknowledgment(query) };
  }

  // Classify complexity for token budget
  const complexity = classifyComplexity(query || "");
  const model = "claude-sonnet-4-6";
  const maxTokens = complexity === "quick" ? 12000 : complexity === "medium" ? 20000 : 28000;
  console.log(`[stream] Complexity: ${complexity} → Model: ${model}, maxTokens: ${maxTokens}`);

  // Start search in parallel (non-blocking) if needed
  let searchPromise: Promise<string | null> | null = null;
  if (query && mightNeedSearch(query)) {
    yield { type: "status", message: "Searching the web..." };
    const searchAbort = new AbortController();
    searchPromise = Promise.race([
      searchForContext(query, searchAbort.signal),
      new Promise<null>((resolve) =>
        setTimeout(() => { searchAbort.abort(); resolve(null); }, 5000)
      ),
    ]);
  }

  // Wait for search before starting visualization
  let searchContext: string | null = null;
  if (searchPromise) {
    searchContext = await searchPromise;
    if (searchContext) {
      yield { type: "status", message: "Found real-time info" };
    }
  }

  let promptText = query || "Explain what you see in this image visually.";
  if (searchContext) {
    promptText += `\n\n[REAL-TIME WEB SEARCH RESULTS]\n${searchContext}\n[END SEARCH RESULTS]\n\nUse the real-time information above to create an accurate visual answer. Show the ACTUAL data from the search results.`;
  }

  userContent.push({ type: "text", text: promptText });

  yield { type: "status", message: "Understanding your question..." };

  // Build messages array with conversation history
  const messages: Anthropic.Messages.MessageParam[] = [];

  if (history && history.length > 0) {
    const recentHistory = history.slice(-2);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: userContent });

  // Build request params — add extended thinking when enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestParams: any = {
    model,
    max_tokens: maxTokens,
    system: [SYSTEM_MESSAGE],
    messages,
  };

  if (thinking) {
    requestParams.thinking = {
      type: "enabled",
      budget_tokens: Math.min(10000, maxTokens - 1000),
    };
    yield { type: "status", message: "Thinking deeply..." };
  } else {
    yield { type: "status", message: "Thinking..." };
  }

  const stream = anthropic.messages.stream(requestParams);

  let accumulated = "";
  let headerSent = false;
  let stepsFound = 0;

  for await (const rawEvent of stream) {
    if (
      rawEvent.type === "content_block_delta" &&
      "text" in rawEvent.delta
    ) {
      accumulated += (rawEvent.delta as { type: string; text: string }).text;

      // Extract title as soon as it appears
      if (!headerSent) {
        const titleMatch = accumulated.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (titleMatch) {
          headerSent = true;
          yield { type: "status", message: "Composing visuals..." };
          yield {
            type: "header",
            title: titleMatch[1].replace(/\\"/g, '"'),
          };
        }
      }

      // Extract any newly completed steps
      const newSteps = extractStepsFromPartial(accumulated, stepsFound);
      for (const rawStep of newSteps) {
        stepsFound++;
        const step = rawStep as Record<string, unknown>;
        if (Array.isArray(step.phases)) {
          console.log(`[step ${stepsFound}] ${(step.phases as unknown[]).length} phases`);
        }
        if (stepsFound === 1) {
          yield { type: "status", message: "Drawing..." };
        }
        yield { type: "step", step: normalizeStep(rawStep, stepsFound - 1) };
      }
    }
  }

  console.log(`[stream] Finished streaming. Steps found: ${stepsFound}, accumulated length: ${accumulated.length}`);
  if (stepsFound === 0) {
    console.log("[stream] No steps extracted! First 500 chars of response:", accumulated.substring(0, 500));
  }

  // Fallback: if header was never sent, parse the full response
  if (!headerSent) {
    try {
      let jsonStr = accumulated;
      const jsonStart = jsonStr.indexOf("{");
      if (jsonStart > 0) jsonStr = jsonStr.substring(jsonStart);
      const jsonEnd = jsonStr.lastIndexOf("}");
      if (jsonEnd !== -1) jsonStr = jsonStr.substring(0, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      const title = parsed.title || query || "Visual Explanation";
      yield { type: "header", title };
      if (Array.isArray(parsed.steps)) {
        for (let i = stepsFound; i < parsed.steps.length; i++) {
          yield { type: "step", step: normalizeStep(parsed.steps[i], i) };
        }
      }
    } catch {
      yield { type: "error", message: "Failed to parse Claude's response" };
      return;
    }
  }

  yield { type: "done" };
}
