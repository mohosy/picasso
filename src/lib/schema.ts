// Phase-based visual answer schema — AI draws strokes synchronized with narration

// A single drawing phase — one "beat" of the teacher's explanation
export interface DrawingPhase {
  id: string;
  strokes: string;          // SVG path/polyline elements to draw during this phase
  narration: string;         // What the AI says while drawing (15-30 words)
  camera?: {                 // Where to point the camera (zoom/pan target region)
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface StepMedia {
  imageUrls?: string[];  // Up to 2 real photos
  videoId?: string;
  videoTitle?: string;
}

export interface SceneStep {
  stepNumber: number;
  phases: DrawingPhase[];    // Ordered drawing phases (3-8 per step)
  imageSearchQuery?: string; // Google image search query (Claude provides)
  videoSearchQuery?: string; // YouTube search query (Claude provides)
  imageMode?: "background" | "side"; // "background" = draw annotations over image, "side" = thumbnail overlay
  media?: StepMedia;         // Resolved media (fetched by the app)
}

export interface SceneAnswer {
  title: string;
  steps: SceneStep[];
}

export interface PicassoAnswer {
  id: string;
  query: string;
  answer: SceneAnswer;
}
