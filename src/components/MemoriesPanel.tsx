import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Heart,
  Image as ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  RotateCcw,
  Trash2,
  Trophy,
} from 'lucide-react';
import type {
  SavedCanvasSnapshot,
  SavedCanvasStrokeCompact,
  SavedGameHistory,
} from '../services/memoriesService.ts';
import type { VibeState } from '../types/room.ts';

interface MemoriesPanelProps {
  roomCode: string;
  vibe: VibeState;
  user: User | null;
  authReady: boolean;
  authError: string | null;
  isSigningIn: boolean;
  snapshots: SavedCanvasSnapshot[];
  gameHistory: SavedGameHistory[];
  loadingMemories: boolean;
  memoriesError: string | null;
  isConnected: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onRestoreSnapshot: (strokes: SavedCanvasStrokeCompact[]) => void;
  onDeleteSnapshot: (snapshotId: string) => Promise<void>;
  onDeleteGameRecord: (gameId: string) => Promise<void>;
}

function SnapshotThumbnail({
  strokes,
  title,
  onDownloadReady,
}: {
  strokes: SavedCanvasStrokeCompact[];
  title: string;
  onDownloadReady?: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 480;
    const height = 270;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#141217';
    ctx.fillRect(0, 0, width, height);

    for (const stroke of strokes) {
      const pts = stroke.points || [];
      if (pts.length === 0) continue;

      const scaleFactor = width / 800;
      const strokeWidth = (stroke.size || 4) * scaleFactor;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color || '#F4F1EC';
      ctx.fillStyle = stroke.color || '#F4F1EC';
      ctx.lineWidth = strokeWidth;

      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x * width, pts[0].y * height, strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * width, pts[0].y * height);
        for (let i = 1; i < pts.length - 1; i += 1) {
          const curr = pts[i];
          const next = pts[i + 1];
          ctx.quadraticCurveTo(
            curr.x * width,
            curr.y * height,
            ((curr.x + next.x) / 2) * width,
            ((curr.y + next.y) / 2) * height
          );
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x * width, last.y * height);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (onDownloadReady) {
      onDownloadReady(canvas.toDataURL('image/png'));
    }
  }, [strokes, onDownloadReady]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Canvas snapshot: ${title}`}
      className="aspect-video w-full rounded-xl border border-white/10 bg-[#141217]"
    />
  );
}

function formatDateTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

export function MemoriesPanel({
  roomCode,
  vibe,
  user,
  authReady,
  authError,
  isSigningIn,
  snapshots,
  gameHistory,
  loadingMemories,
  memoriesError,
  isConnected,
  onSignIn,
  onSignOut,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onDeleteGameRecord,
}: MemoriesPanelProps) {
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRestore = (snap: SavedCanvasSnapshot) => {
    onRestoreSnapshot(snap.strokes);
    setRestoredId(snap.id);
    window.setTimeout(() => setRestoredId(null), 2500);
  };

  const handleDeleteSnapshot = async (id: string) => {
    setActionError(null);
    try {
      await onDeleteSnapshot(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete snapshot.');
    }
  };

  const handleDeleteGame = async (id: string) => {
    setActionError(null);
    try {
      await onDeleteGameRecord(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete game record.');
    }
  };

  return (
    <section aria-label="Room Memories" className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#F4F1EC]">
            Date-Night Memories · Room {roomCode}
          </h2>
          <p className="mt-1 text-sm text-[#A8A2AE]">
            Saved canvas artwork, completed couple game scores, and room mood history persisted in Firestore.
          </p>
        </div>

        {authReady && user && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-[#B6B0BA]">
              Signed in as <strong className="text-[#F4F1EC]">{user.displayName || user.email}</strong>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#19171C] px-3.5 py-1.5 text-xs font-medium text-[#D1CBD6] hover:bg-[#26232B] whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        )}
      </div>

      {!authReady ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#19171C] p-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#D94B6A]" aria-hidden="true" />
          <p className="text-sm text-[#B6B0BA]">Checking account session...</p>
        </div>
      ) : !user ? (
        <div className="rounded-2xl border border-white/10 bg-[#19171C] p-8 text-center">
          <BookmarkCheck className="mx-auto h-8 w-8 text-[#D94B6A]" aria-hidden="true" />
          <h3 className="mt-3 text-xl font-semibold text-[#F4F1EC]">
            Sign in to save &amp; revisit room memories
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#A8A2AE]">
            Connect your Google account so your canvas snapshots, completed couple game scores, and
            room metadata are stored securely for whenever you rejoin room{' '}
            <span className="font-mono font-semibold text-[#F4F1EC]">{roomCode}</span>.
          </p>
          {authError && (
            <p className="mt-3 text-xs text-[#F48C84]">{authError}</p>
          )}
          <button
            type="button"
            disabled={isSigningIn}
            onClick={onSignIn}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-60 whitespace-nowrap"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in with Google
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          {(memoriesError || actionError) && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-[#F07167]/40 bg-[#28171A] p-4"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F48C84]" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-[#FDE8E6]">
                {actionError || memoriesError}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-[#19171C] p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[#9D97A4]">Current Evening Vibe</p>
              <p className="mt-1 text-sm font-medium text-[#F4F1EC]">
                {vibe.craving} · {vibe.soundtrack}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#9D97A4]">Saved Canvas Snapshots</p>
              <p className="mt-1 font-mono text-lg font-semibold text-[#F4F1EC] tabular-nums">
                {snapshots.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#9D97A4]">Completed Game Rounds</p>
              <p className="mt-1 font-mono text-lg font-semibold text-[#F4F1EC] tabular-nums">
                {gameHistory.length}
              </p>
            </div>
          </div>

          {loadingMemories ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#161419] p-6">
              <Loader2 className="h-5 w-5 animate-spin text-[#D94B6A]" aria-hidden="true" />
              <p className="text-sm text-[#B6B0BA]">Loading room snapshots and game history...</p>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#F4F1EC]">
                  Saved Canvas Snapshots
                </h3>

                {snapshots.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-[#161419] px-6 py-10 text-center">
                    <ImageIcon className="mx-auto h-7 w-7 text-[#8E8894]" aria-hidden="true" />
                    <p className="mt-3 text-base font-medium text-[#F4F1EC]">
                      No saved canvas snapshots yet
                    </p>
                    <p className="mt-1 text-sm text-[#A8A2AE]">
                      Sketch together in the Drawing Canvas tab and click Save Snapshot to keep it here.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {snapshots.map((snap) => (
                      <article
                        key={snap.id}
                        className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#19171C] p-5"
                      >
                        <div>
                          <SnapshotThumbnail
                            strokes={snap.strokes}
                            title={snap.title}
                            onDownloadReady={(url) =>
                              setDownloadUrls((prev) =>
                                prev[snap.id] === url ? prev : { ...prev, [snap.id]: url }
                              )
                            }
                          />

                          <div className="mt-4 flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold text-[#F4F1EC]">
                                {snap.title}
                              </h4>
                              <p className="mt-1 text-xs text-[#9D97A4]">
                                Saved by {snap.savedByName} · {snap.strokeCount} strokes ·{' '}
                                {formatDateTime(snap.createdAtMs)}
                              </p>
                            </div>
                            {snap.savedByUid === user.uid && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteSnapshot(snap.id)}
                                aria-label={`Delete snapshot ${snap.title}`}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8E8894] hover:bg-white/5 hover:text-[#F48C84]"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                          <button
                            type="button"
                            disabled={!isConnected}
                            onClick={() => handleRestore(snap)}
                            className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#232028] px-3 py-1.5 text-xs font-medium text-[#F4F1EC] hover:bg-[#2E2A35] disabled:opacity-40 whitespace-nowrap"
                          >
                            {restoredId === snap.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-[#52B788]" aria-hidden="true" />
                                Loaded onto Canvas
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                                Load onto Canvas
                              </>
                            )}
                          </button>
                          {downloadUrls[snap.id] && (
                            <a
                              href={downloadUrls[snap.id]}
                              download={`${snap.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
                              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#121115] px-3 py-1.5 text-xs font-medium text-[#D1CBD6] hover:bg-[#232028] whitespace-nowrap"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              PNG
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#F4F1EC]">
                  Completed Daily Game History &amp; Scores
                </h3>

                {gameHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-[#161419] px-6 py-10 text-center">
                    <Trophy className="mx-auto h-7 w-7 text-[#8E8894]" aria-hidden="true" />
                    <p className="mt-3 text-base font-medium text-[#F4F1EC]">
                      No saved couple games yet
                    </p>
                    <p className="mt-1 text-sm text-[#A8A2AE]">
                      Play a 5-card round in the Couple Game tab and save your match score to keep it here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gameHistory.map((game) => {
                      const expanded = expandedGameId === game.id;
                      return (
                        <article
                          key={game.id}
                          className="rounded-2xl border border-white/10 bg-[#19171C] p-5"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#9D97A4]">
                                <span className="font-medium text-[#F08099]">
                                  {game.mode === 'would_you_rather'
                                    ? 'Would You Rather'
                                    : 'How Well Do You Know Me?'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{game.moodTag}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatDateTime(game.createdAtMs)}</span>
                              </div>
                              <h4 className="mt-1.5 text-lg font-semibold text-[#F4F1EC] tabular-nums">
                                {game.matchScore} of {game.totalQuestions} Matches
                              </h4>
                              <p className="mt-0.5 text-xs text-[#A8A2AE]">
                                Played by {game.partnerNames.join(' & ')}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedGameId(expanded ? null : game.id)
                                }
                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#232028] px-3.5 py-1.5 text-xs font-medium text-[#E5E0E8] hover:bg-[#2E2A35] whitespace-nowrap"
                              >
                                {expanded ? (
                                  <>
                                    Hide Answers
                                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                                  </>
                                ) : (
                                  <>
                                    View Answers
                                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                  </>
                                )}
                              </button>
                              {game.savedByUid === user.uid && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteGame(game.id)}
                                  aria-label="Delete saved game"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#8E8894] hover:bg-white/5 hover:text-[#F48C84]"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </div>

                          {expanded && (
                            <div className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
                              {game.rounds.map((r, idx) => (
                                <div
                                  key={`${game.id}-r-${idx}`}
                                  className="rounded-xl border border-white/10 bg-[#121115] p-3.5"
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-mono text-[#9D97A4] tabular-nums">
                                      Q{idx + 1}
                                    </span>
                                    {r.matched ? (
                                      <span className="inline-flex items-center gap-1 font-semibold text-[#52B788]">
                                        <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
                                        Matched
                                      </span>
                                    ) : (
                                      <span className="text-[#9D97A4]">Different picks</span>
                                    )}
                                  </div>
                                  <p className="mt-1.5 text-sm font-medium text-[#F4F1EC]">
                                    {r.prompt}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#B6B0BA]">
                                    {r.picks.map((pick, pIdx) => (
                                      <span key={`${game.id}-r-${idx}-p-${pIdx}`}>
                                        {pick.partnerName}:{' '}
                                        <strong className="text-[#F4F1EC]">
                                          {pick.optionText}
                                        </strong>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
