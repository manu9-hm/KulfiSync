import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Download,
  Eraser,
  Loader2,
  LogIn,
  Paintbrush,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { CanvasPoint, CanvasStroke } from '../types/room.ts';

interface SharedCanvasPanelProps {
  strokes: CanvasStroke[];
  partnerLiveStroke: CanvasStroke | null;
  myPartnerId: string;
  myPartnerName: string;
  isConnected: boolean;
  isSignedIn: boolean;
  isSavingSnapshot: boolean;
  onSendLiveStroke: (stroke: CanvasStroke) => void;
  onCommitStroke: (stroke: CanvasStroke) => void;
  onUndo: () => void;
  onClear: () => void;
  onSignIn: () => void;
  onSaveSnapshot: (title: string) => Promise<void>;
}

const CANVAS_BG = '#141217';

const INK_PALETTE: { label: string; color: string; isEraser?: boolean }[] = [
  { label: 'Warm Ivory', color: '#F4F1EC' },
  { label: 'Rosewood', color: '#D94B6A' },
  { label: 'Saffron Gold', color: '#F4B942' },
  { label: 'Pistachio', color: '#52B788' },
  { label: 'Dusk Violet', color: '#A78BFA' },
  { label: 'Eraser', color: CANVAS_BG, isEraser: true },
];

const BRUSH_SIZES: { label: string; size: number }[] = [
  { label: 'Fine', size: 3 },
  { label: 'Medium', size: 7 },
  { label: 'Bold', size: 13 },
];

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: CanvasStroke,
  width: number,
  height: number
): void {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  const scaleFactor = Math.max(width / 800, 0.55);
  const strokeWidth = stroke.size * scaleFactor;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = strokeWidth;

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x * width, pts[0].y * height, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x * width, pts[0].y * height);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const curr = pts[i];
    const next = pts[i + 1];
    const midX = ((curr.x + next.x) / 2) * width;
    const midY = ((curr.y + next.y) / 2) * height;
    ctx.quadraticCurveTo(curr.x * width, curr.y * height, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x * width, last.y * height);
  ctx.stroke();
  ctx.restore();
}

export function SharedCanvasPanel({
  strokes,
  partnerLiveStroke,
  myPartnerId,
  myPartnerName,
  isConnected,
  isSignedIn,
  isSavingSnapshot,
  onSendLiveStroke,
  onCommitStroke,
  onUndo,
  onClear,
  onSignIn,
  onSaveSnapshot,
}: SharedCanvasPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<CanvasStroke | null>(null);
  const lastLiveEmitRef = useRef<number>(0);

  const [selectedColor, setSelectedColor] = useState<string>(INK_PALETTE[0].color);
  const [selectedSize, setSelectedSize] = useState<number>(BRUSH_SIZES[1].size);
  const [isDrawingLocal, setIsDrawingLocal] = useState<boolean>(false);
  const [snapshotTitle, setSnapshotTitle] = useState<string>('Evening Sketch');
  const [saveFeedback, setSaveFeedback] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number }>({
    width: 800,
    height: 500,
  });

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvasDims.width;
    const cssHeight = canvasDims.height;

    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    for (const stroke of strokes) {
      drawStroke(ctx, stroke, cssWidth, cssHeight);
    }
    if (partnerLiveStroke) {
      drawStroke(ctx, partnerLiveStroke, cssWidth, cssHeight);
    }
    if (activeStrokeRef.current) {
      drawStroke(ctx, activeStrokeRef.current, cssWidth, cssHeight);
    }
  }, [canvasDims, partnerLiveStroke, strokes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasDims({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isConnected || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const point = getNormalizedPoint(e);
    const stroke: CanvasStroke = {
      id: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      authorId: myPartnerId,
      authorName: myPartnerName || 'Partner',
      color: selectedColor,
      size: selectedColor === CANVAS_BG ? Math.max(selectedSize, 12) : selectedSize,
      points: [point],
      createdAt: Date.now(),
    };

    activeStrokeRef.current = stroke;
    setIsDrawingLocal(true);
    renderCanvas();
    onSendLiveStroke(stroke);
    lastLiveEmitRef.current = performance.now();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || !isConnected) return;

    const point = getNormalizedPoint(e);
    const lastPt = stroke.points[stroke.points.length - 1];
    if (
      lastPt &&
      Math.hypot(point.x - lastPt.x, point.y - lastPt.y) < 0.0025
    ) {
      return;
    }

    stroke.points.push(point);
    renderCanvas();

    const now = performance.now();
    if (now - lastLiveEmitRef.current >= 35) {
      lastLiveEmitRef.current = now;
      onSendLiveStroke({ ...stroke, points: [...stroke.points] });
    }
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    setIsDrawingLocal(false);
    renderCanvas();
    onCommitStroke(stroke);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `kulfisync-sketch-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (strokes.length === 0 || isSavingSnapshot) return;
    setSaveError(null);
    try {
      await onSaveSnapshot(snapshotTitle.trim() || 'Evening Sketch');
      setSaveFeedback(true);
      window.setTimeout(() => setSaveFeedback(false), 2600);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save canvas snapshot.');
    }
  };

  const myStrokeCount = strokes.filter((s) => s.authorId === myPartnerId).length;
  const isEmpty = strokes.length === 0 && !isDrawingLocal && !partnerLiveStroke;

  return (
    <section aria-label="Shared Drawing Canvas" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#F4F1EC]">Shared Evening Canvas</h2>
          <p className="mt-1 text-sm text-[#A8A2AE]">
            Sketch a memory, play Pictionary, or leave a midnight doodle—every stroke syncs live.
            {partnerLiveStroke && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-medium text-[#F08099]">
                  {partnerLiveStroke.authorName} is drawing...
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onUndo}
            disabled={!isConnected || myStrokeCount === 0}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#19171C] px-3.5 py-2 text-xs font-medium text-[#E5E0E8] transition-colors hover:bg-[#26232B] disabled:opacity-40 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Undo Mine
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!isConnected || strokes.length === 0}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#19171C] px-3.5 py-2 text-xs font-medium text-[#F48C84] transition-colors hover:bg-[#2A1A1D] disabled:opacity-40 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear All
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={strokes.length === 0}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#221F26] px-3.5 py-2 text-xs font-medium text-[#F4F1EC] transition-colors hover:bg-[#2D2933] disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
            Save PNG
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#19171C] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-[#9D97A4]">Ink</span>
          {INK_PALETTE.map((swatch) => {
            const active = selectedColor === swatch.color;
            return (
              <button
                key={swatch.label}
                type="button"
                aria-label={swatch.label}
                title={swatch.label}
                onClick={() => setSelectedColor(swatch.color)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-transform active:scale-95 ${
                  active
                    ? 'border-[#F4F1EC] ring-2 ring-[#D94B6A]/70'
                    : 'border-white/15 hover:border-white/35'
                }`}
                style={{ backgroundColor: swatch.color }}
              >
                {swatch.isEraser && (
                  <Eraser className="h-4 w-4 text-[#D1CBD6]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#121115] p-1">
          {BRUSH_SIZES.map((b) => {
            const active = selectedSize === b.size;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => setSelectedSize(b.size)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#2A2630] text-[#F4F1EC]'
                    : 'text-[#9D97A4] hover:text-[#F4F1EC]'
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/15 bg-[#141217] sm:aspect-[16/9]"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className={`h-full w-full touch-none select-none ${
            isConnected ? 'cursor-crosshair' : 'cursor-not-allowed opacity-70'
          }`}
        />

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <Paintbrush className="h-7 w-7 text-[#6E6775]" aria-hidden="true" />
            <p className="mt-3 text-base font-medium text-[#D1CBD6]">
              Blank evening canvas
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#8E8894]">
              Draw with your finger or cursor. Every stroke appears on your partner&apos;s screen as you sketch.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#19171C] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-[#8E8894]">
          <span className="tabular-nums text-[#D1CBD6]">{strokes.length} synced strokes</span>
          <span aria-hidden="true"> · </span>
          <span>Save to room memories for future date nights</span>
          {saveError && (
            <p className="mt-1 text-xs text-[#F48C84]">{saveError}</p>
          )}
        </div>

        {isSignedIn ? (
          <form onSubmit={(e) => void handleSaveMemory(e)} className="flex flex-wrap items-center gap-2">
            <label htmlFor="snapshot-title-input" className="sr-only">
              Snapshot title
            </label>
            <input
              id="snapshot-title-input"
              type="text"
              maxLength={80}
              value={snapshotTitle}
              onChange={(e) => setSnapshotTitle(e.target.value)}
              placeholder="Snapshot title"
              disabled={isSavingSnapshot}
              className="h-10 w-44 rounded-xl border border-white/15 bg-[#121115] px-3 text-xs text-[#F4F1EC] placeholder:text-[#6E6775] focus:border-[#D94B6A] focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={strokes.length === 0 || isSavingSnapshot}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D94B6A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-45 whitespace-nowrap"
            >
              {isSavingSnapshot ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Saving...
                </>
              ) : saveFeedback ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved to Memories
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Save Snapshot
                </>
              )}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#221F26] px-4 py-2 text-xs font-medium text-[#F4F1EC] transition-colors hover:bg-[#2D2933] whitespace-nowrap"
          >
            <LogIn className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
            Sign in to Save Snapshot
          </button>
        )}
      </div>
    </section>
  );
}
