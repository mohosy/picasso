import { useState, useCallback, useRef, useEffect } from "react";

interface CanvasTransform {
  x: number;
  y: number;
  zoom: number;
}

interface UseInfiniteCanvasReturn {
  transform: CanvasTransform;
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  panTo: (x: number, y: number, smooth?: boolean) => void;
  zoomTo: (zoom: number) => void;
  resetView: () => void;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;

export function useInfiniteCanvas(): UseInfiniteCanvasReturn {
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, zoom: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastTransform = useRef({ x: 0, y: 0 });

  const panTo = useCallback((x: number, y: number, smooth = true) => {
    if (smooth && containerRef.current) {
      containerRef.current.style.transition = "none";
      if (contentRef.current) {
        contentRef.current.style.transition = "transform 0.5s ease-out";
      }
      setTimeout(() => {
        if (contentRef.current) contentRef.current.style.transition = "none";
      }, 500);
    }
    setTransform((prev) => ({ ...prev, x, y }));
  }, []);

  const zoomTo = useCallback((zoom: number) => {
    setTransform((prev) => ({ ...prev, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }));
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, zoom: 1 });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Mouse drag for panning ---
    const onMouseDown = (e: MouseEvent) => {
      // Don't pan if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-pan]") || target.closest("input") || target.closest("button") || target.closest("form")) return;

      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastTransform.current = { x: transform.x, y: transform.y };
      container.style.cursor = "grabbing";
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setTransform((prev) => ({
        ...prev,
        x: lastTransform.current.x + dx,
        y: lastTransform.current.y + dy,
      }));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      container.style.cursor = "grab";
    };

    // --- Wheel for zoom ---
    const onWheel = (e: WheelEvent) => {
      // If target is inside a [data-no-pan] element, don't intercept
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-pan]")) return;

      e.preventDefault();

      // Pinch zoom (ctrlKey is true for trackpad pinch)
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.005;
        setTransform((prev) => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom + delta));
          // Zoom toward cursor
          const rect = container.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const scale = newZoom / prev.zoom;
          return {
            zoom: newZoom,
            x: cx - scale * (cx - prev.x),
            y: cy - scale * (cy - prev.y),
          };
        });
      } else {
        // Regular scroll = pan
        setTransform((prev) => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    // --- Touch events for mobile ---
    let lastTouchDist = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    let isTouchPanning = false;

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-pan]") || target.closest("input") || target.closest("button") || target.closest("form")) return;

      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        lastTouchCenter = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        isTouchPanning = true;
        lastTransform.current = { x: transform.x, y: transform.y };
      } else if (e.touches.length === 1) {
        isDragging.current = true;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastTransform.current = { x: transform.x, y: transform.y };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isTouchPanning) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const center = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };

        const scale = dist / lastTouchDist;
        const dx = center.x - lastTouchCenter.x;
        const dy = center.y - lastTouchCenter.y;

        setTransform((prev) => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * scale));
          return {
            zoom: newZoom,
            x: prev.x + dx,
            y: prev.y + dy,
          };
        });

        lastTouchDist = dist;
        lastTouchCenter = center;
      } else if (e.touches.length === 1 && isDragging.current) {
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        setTransform((prev) => ({
          ...prev,
          x: lastTransform.current.x + dx,
          y: lastTransform.current.y + dy,
        }));
      }
    };

    const onTouchEnd = () => {
      isDragging.current = false;
      isTouchPanning = false;
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);

    container.style.cursor = "grab";

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  // We intentionally only re-attach on mount. Transform is read via refs inside handlers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep lastTransform in sync for new event handler closures
  useEffect(() => {
    lastTransform.current = { x: transform.x, y: transform.y };
  }, [transform.x, transform.y]);

  return { transform, containerRef, contentRef, panTo, zoomTo, resetView };
}
