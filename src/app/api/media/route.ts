import { NextRequest } from "next/server";

const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_ENGINE_ID;

async function fetchGoogleImages(query: string): Promise<string[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=5&safe=active&imgType=photo&imgSize=medium`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error("[media] Google image search failed:", res.status);
      return [];
    }
    const data = await res.json();
    const items: Array<{ link: string }> = data.items || [];
    // Return up to 2 valid URLs
    return items.map((i) => i.link).filter(Boolean).slice(0, 2);
  } catch (err) {
    console.error("[media] fetchGoogleImages error:", err);
    return [];
  }
}

async function fetchYouTubeVideo(query: string): Promise<{ videoId: string; title: string } | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${GOOGLE_API_KEY}&q=${encodeURIComponent(query)}&part=snippet&type=video&maxResults=1&safeSearch=strict&videoEmbeddable=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error("[media] YouTube search failed:", res.status);
      return null;
    }
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;
    return { videoId: item.id.videoId, title: item.snippet.title };
  } catch (err) {
    console.error("[media] fetchYouTubeVideo error:", err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageQuery = searchParams.get("imageQuery");
  const videoQuery = searchParams.get("videoQuery");

  if (!imageQuery && !videoQuery) {
    return Response.json({ imageUrls: [], videoId: null, videoTitle: null });
  }

  const [imageUrls, videoResult] = await Promise.all([
    imageQuery ? fetchGoogleImages(imageQuery) : Promise.resolve([]),
    videoQuery ? fetchYouTubeVideo(videoQuery) : Promise.resolve(null),
  ]);

  return Response.json({
    imageUrls,
    videoId: videoResult?.videoId ?? null,
    videoTitle: videoResult?.title ?? null,
  });
}
