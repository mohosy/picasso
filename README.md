<p align="center">
  <img src="public/rabbit1.png" alt="Picasso" width="120" />
</p>

<h1 align="center">Picasso</h1>

<p align="center">
  <strong>AI that draws its answers.</strong>
</p>

<p align="center">
  Ask a question. Watch it come to life — sketched, animated, and narrated in real time on an infinite canvas.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a>
</p>

---

## What is Picasso?

Picasso is a visual AI engine. Instead of walls of text, it **draws** the answer — stroke by stroke, with narration, real images, and smooth animations. Think of it as a whiteboard that explains things to you.

Ask *"How does photosynthesis work?"* and Picasso will sketch chloroplasts, animate light absorption, narrate each step aloud, and pull in real photos — all on a pannable infinite canvas.

## Features

- **Animated SVG Drawing** — Answers render stroke-by-stroke using GSAP-powered SVG animations. Fills, labels, and annotations appear in choreographed sequence.
- **Voice Narration** — Every explanation is narrated aloud via ElevenLabs TTS. Choose from 7 voices. Audio is preloaded and synced to the drawing timeline.
- **Infinite Canvas** — Pan, zoom, and explore like Figma. Multiple answers live side-by-side on a boundless workspace.
- **Real Media** — Google Images and YouTube videos are embedded directly into answers for grounding.
- **Web Search** — Picasso can search the web for real-time info (weather, news, scores) before drawing.
- **Image Input** — Upload an image and ask questions about it. Picasso will annotate and explain what it sees.
- **Extended Thinking** — Toggle deep reasoning mode for complex questions.
- **Streaming-First** — Responses stream in real time. Drawing starts before the full answer is generated.
- **Dark Mode** — Full light/dark/system theme support.
- **Subtitles** — Optional closed captions for narration.

## How It Works

```
You ask a question
        ↓
Claude generates a structured visual answer
(title, steps, drawing phases, narration scripts, camera instructions)
        ↓
The frontend streams the response and begins rendering immediately
        ↓
Each phase: camera pans → strokes draw → fills appear → labels fade in → narration plays
        ↓
Real photos and videos load in the background and slot into the canvas
```

Every answer is a **multi-step visual scene** — a sequence of drawing phases, each with its own SVG artwork, camera position, and narration. The engine orchestrates all of it on a synchronized GSAP timeline.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | [Next.js 16](https://nextjs.org) + React 19 |
| AI | [Claude](https://anthropic.com) (Sonnet for drawing, Haiku for search) |
| Animation | [GSAP](https://gsap.com) + native SVG |
| Voice | [ElevenLabs](https://elevenlabs.io) TTS |
| Media | Google Custom Search API |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Language | TypeScript |

## Getting Started

### Prerequisites

- Node.js 18+
- API keys for: [Anthropic](https://console.anthropic.com), [ElevenLabs](https://elevenlabs.io), [Google Custom Search](https://developers.google.com/custom-search/v1/overview)

### Setup

```bash
git clone https://github.com/mohosy/picasso.git
cd picasso
npm install
```

Create a `.env.local` file:

```env
ANTHROPIC_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
GOOGLE_SEARCH_API_KEY=your_key
GOOGLE_SEARCH_ENGINE_ID=your_id
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── visualize/     → Streams visual answers from Claude
│   │   ├── speak/         → ElevenLabs TTS proxy
│   │   └── media/         → Google Images + YouTube fetcher
│   ├── page.tsx           → Main UI: landing, canvas, cards
│   └── globals.css        → Canvas patterns + animations
├── components/
│   ├── InputBar.tsx        → Text + image input with Think toggle
│   ├── SceneStage.tsx      → Answer card with playback controls
│   ├── SettingsModal.tsx   → Theme, voice, narration settings
│   └── DynamicSVGRenderer.tsx → GSAP drawing engine
├── hooks/
│   ├── useCanvasAnswers.ts → Answer generation + conversation memory
│   ├── useInfiniteCanvas.ts → Pan/zoom interactions
│   ├── useSettings.ts      → Persistent user preferences
│   └── useTheme.ts         → Dark/light mode
└── lib/
    ├── claude.ts           → Streaming, JSON parsing, web search
    ├── narration.ts        → Audio preload/play/queue system
    ├── prompts.ts          → System prompt for visual generation
    └── schema.ts           → TypeScript type definitions
```

## License

MIT
