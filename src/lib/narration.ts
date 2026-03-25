import { getSettings } from "@/hooks/useSettings";

function isNarrationEnabled(): boolean {
  return getSettings().narrationEnabled;
}

function getSelectedVoiceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("picasso-voice") || undefined;
}

let currentAudio: HTMLAudioElement | null = null;
const preloadCache = new Map<string, { audio: HTMLAudioElement; url: string }>();

// Queue of element IDs waiting to be spoken (plays back-to-back, no cutoff)
const playbackQueue: string[] = [];

// IDs that were requested for playback but audio wasn't ready yet
const pendingPlayback = new Set<string>();

// Concurrency limiter for ElevenLabs API preload calls
const MAX_CONCURRENT = 5;
let activeCount = 0;
const fetchQueue: (() => void)[] = [];

function runNextFetch() {
  if (fetchQueue.length > 0 && activeCount < MAX_CONCURRENT) {
    activeCount++;
    const task = fetchQueue.shift()!;
    task();
  }
}

/**
 * Play an Audio element through the shared currentAudio slot.
 * When it finishes, automatically plays the next queued narration.
 */
function playAudio(audio: HTMLAudioElement) {
  // Stop whatever's playing without clearing the queue
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio.currentTime = 0;
  }

  currentAudio = audio;
  audio.currentTime = 0;
  audio.onended = () => {
    currentAudio = null;
    playNextQueued();
  };
  audio.play().catch(() => {
    currentAudio = null;
    playNextQueued();
  });
}

function playNextQueued() {
  while (playbackQueue.length > 0) {
    const nextId = playbackQueue.shift()!;
    const entry = preloadCache.get(nextId);
    if (entry?.audio) {
      playAudio(entry.audio);
      return;
    }
    // Entry not ready yet — skip it
  }
}

/**
 * Pre-fetch ElevenLabs audio for a narration phrase.
 * Call this as soon as a step arrives so audio is ready before playback.
 * Rate-limited to MAX_CONCURRENT concurrent requests.
 * If playback was already requested (pending), plays immediately when ready.
 */
export async function preloadNarration(elementId: string, text: string): Promise<void> {
  if (!isNarrationEnabled()) return;
  if (preloadCache.has(elementId)) return;

  // Mark as pending to avoid duplicate queuing
  preloadCache.set(elementId, null as unknown as { audio: HTMLAudioElement; url: string });

  return new Promise<void>((resolve) => {
    const task = async () => {
      try {
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId: getSelectedVoiceId() }),
        });

        if (!response.ok) {
          preloadCache.delete(elementId);
          pendingPlayback.delete(elementId);
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = "auto";
        preloadCache.set(elementId, { audio, url });

        // If playback was requested while we were loading, play now
        if (pendingPlayback.has(elementId)) {
          pendingPlayback.delete(elementId);
          if (currentAudio && !currentAudio.paused) {
            // Something is playing — queue this one next
            playbackQueue.unshift(elementId);
          } else {
            playAudio(audio);
          }
        }
      } catch {
        preloadCache.delete(elementId);
        pendingPlayback.delete(elementId);
      } finally {
        activeCount--;
        runNextFetch();
        resolve();
      }
    };

    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      task();
    } else {
      fetchQueue.push(task);
    }
  });
}

/**
 * Play pre-fetched audio for a specific element.
 * If audio isn't preloaded yet, marks it as pending so it plays as soon as it's ready.
 * If something is already playing, queues this narration to play after it finishes.
 */
export function playNarration(elementId: string): void {
  if (!isNarrationEnabled()) return;
  const entry = preloadCache.get(elementId);

  // Audio not ready yet — mark as pending so it plays when preload completes
  if (!entry || !entry.audio) {
    pendingPlayback.add(elementId);
    return;
  }

  // If something is currently playing, queue this one
  if (currentAudio && !currentAudio.paused) {
    playbackQueue.push(elementId);
    return;
  }

  playAudio(entry.audio);
}

/**
 * Speak arbitrary text immediately (used for acknowledgments).
 * Fetches audio from /api/speak and plays it. Subsequent narrations queue behind it.
 */
export async function speakText(text: string): Promise<void> {
  if (!isNarrationEnabled()) return;
  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId: getSelectedVoiceId() }),
    });
    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preload = "auto";

    // Play immediately — narrations from the timeline will queue behind this
    playAudio(audio);
  } catch {
    // Acknowledgment is best-effort, don't block anything
  }
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  playbackQueue.length = 0;
  fetchQueue.length = 0;
  pendingPlayback.clear();
  for (const [, entry] of preloadCache) {
    if (entry?.url) URL.revokeObjectURL(entry.url);
  }
  preloadCache.clear();
  activeCount = 0;
}

export function pauseSpeaking() {
  currentAudio?.pause();
}

export function resumeSpeaking() {
  currentAudio?.play();
}

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
