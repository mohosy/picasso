import { useState, useCallback, useRef, useEffect } from "react";
import { SceneStep, PicassoAnswer, StepMedia } from "@/lib/schema";
import { speakText } from "@/lib/narration";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UsePicassoReturn {
  answers: PicassoAnswer[];
  activeAnswerId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  status: string | null;
  error: string | null;
  generate: (query: string, image?: string, thinking?: boolean) => void;
  clearAll: () => void;
}

/**
 * Build a compact summary of a visual answer for conversation context.
 */
function summarizeAnswer(answer: PicassoAnswer["answer"]): string {
  const parts: string[] = [];
  if (answer.title) parts.push(`[Visual answer: "${answer.title}"]`);
  for (const step of answer.steps) {
    const narrations = step.phases
      .filter((p) => p.narration)
      .map((p) => p.narration)
      .join(". ");
    if (narrations) parts.push(narrations);
  }
  return parts.join(" ") || "[Visual answer drawn]";
}

/**
 * Fetch a real photo and/or YouTube video for a step's search queries.
 */
async function fetchMediaForStep(step: SceneStep): Promise<StepMedia | null> {
  if (!step.imageSearchQuery && !step.videoSearchQuery) return null;
  try {
    const params = new URLSearchParams();
    if (step.imageSearchQuery) params.set("imageQuery", step.imageSearchQuery);
    if (step.videoSearchQuery) params.set("videoQuery", step.videoSearchQuery);
    const res = await fetch(`/api/media?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const imageUrls: string[] = data.imageUrls || [];
    if (imageUrls.length === 0 && !data.videoId) return null;
    return {
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      videoId: data.videoId || undefined,
      videoTitle: data.videoTitle || undefined,
    };
  } catch {
    return null;
  }
}

export function useCanvasAnswers(): UsePicassoReturn {
  const [answers, setAnswers] = useState<PicassoAnswer[]>([]);
  const [activeAnswerId, setActiveAnswerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<ChatMessage[]>([]);

  // Abort in-flight requests on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const generate = useCallback((query: string, image?: string, thinking?: boolean) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const newId = `answer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const newAnswer: PicassoAnswer = {
      id: newId,
      query,
      answer: { title: "", steps: [] },
    };

    // Add user message to conversation history
    conversationRef.current.push({ role: "user", content: query });

    setAnswers((prev) => [...prev, newAnswer]);
    setActiveAnswerId(newId);
    setIsLoading(true);
    setIsStreaming(false);
    setStatus(null);
    setError(null);

    (async () => {
      const history = conversationRef.current.slice(0, -1);

      try {
        const res = await fetch("/api/visualize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, image, history, thinking: thinking || false }),
          signal: abort.signal,
        });

        if (!res.ok) {
          let msg = `Request failed (${res.status})`;
          try {
            const data = await res.json();
            if (data.error) msg = data.error;
          } catch { /* ignore */ }
          throw new Error(msg);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completedAnswer: PicassoAnswer["answer"] | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;

            const event = JSON.parse(line.slice(6));

            if (event.type === "acknowledgment") {
              speakText(event.text);
            } else if (event.type === "status") {
              setStatus(event.message);
            } else if (event.type === "header") {
              setIsLoading(false);
              setIsStreaming(true);
              setAnswers((prev) =>
                prev.map((a) =>
                  a.id === newId
                    ? {
                        ...a,
                        answer: { ...a.answer, title: event.title },
                      }
                    : a
                )
              );
            } else if (event.type === "step") {
              const incomingStep = event.step as SceneStep;
              setAnswers((prev) =>
                prev.map((a) => {
                  if (a.id !== newId) return a;
                  const updated = {
                    ...a,
                    answer: {
                      ...a.answer,
                      steps: [...a.answer.steps, incomingStep],
                    },
                  };
                  completedAnswer = updated.answer;
                  return updated;
                })
              );
              // Fetch real media in background — update when resolved
              if (incomingStep.imageSearchQuery || incomingStep.videoSearchQuery) {
                const stepNum = incomingStep.stepNumber;
                fetchMediaForStep(incomingStep).then((media) => {
                  if (!media) return;
                  setAnswers((prev) =>
                    prev.map((a) => {
                      if (a.id !== newId) return a;
                      return {
                        ...a,
                        answer: {
                          ...a.answer,
                          steps: a.answer.steps.map((s) =>
                            s.stepNumber === stepNum ? { ...s, media } : s
                          ),
                        },
                      };
                    })
                  );
                });
              }
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }

        // Stream finished — add assistant summary to conversation history
        if (completedAnswer) {
          conversationRef.current.push({
            role: "assistant",
            content: summarizeAnswer(completedAnswer),
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setError(msg);
        setAnswers((prev) => prev.filter((a) => a.id !== newId));
        setActiveAnswerId(null);
        conversationRef.current.pop();
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length]);

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setAnswers([]);
    setActiveAnswerId(null);
    setError(null);
    setStatus(null);
    setIsLoading(false);
    setIsStreaming(false);
    conversationRef.current = [];
  }, []);

  return {
    answers,
    activeAnswerId,
    isLoading,
    isStreaming,
    status,
    error,
    generate,
    clearAll,
  };
}
