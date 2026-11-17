import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  History,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useKulfiRoom.ts';
import type { ArchivedRoom } from '../services/memoriesService.ts';

interface RoomConnectionScreenProps {
  partnerName: string;
  onChangeName: (name: string) => void;
  pendingCode: string;
  onChangePendingCode: (code: string) => void;
  status: ConnectionStatus;
  errorMessage: string | null;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string, name: string) => void;
  onRetry: () => void;
  onClearError: () => void;
  user: User | null;
  authReady: boolean;
  authError: string | null;
  isSigningIn: boolean;
  pastRooms: ArchivedRoom[];
  loadingPastRooms: boolean;
  pastRoomsError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onRefreshPastRooms: () => void;
  onRejoinArchivedRoom: (code: string) => void;
}

export function RoomConnectionScreen({
  partnerName,
  onChangeName,
  pendingCode,
  onChangePendingCode,
  status,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onRetry,
  onClearError,
  user,
  authReady,
  authError,
  isSigningIn,
  pastRooms,
  loadingPastRooms,
  pastRoomsError,
  onSignIn,
  onSignOut,
  onRefreshPastRooms,
  onRejoinArchivedRoom,
}: RoomConnectionScreenProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [cardsImgFailed, setCardsImgFailed] = useState(false);
  const [lastAttemptMode, setLastAttemptMode] = useState<'create' | 'join' | null>(null);

  const isCreating = status === 'creating';
  const isJoining = status === 'joining';
  const isBusy = isCreating || isJoining;
  const hasError = status === 'error' || status === 'disconnected';
  const sanitizedCode = pendingCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setLastAttemptMode('create');
    onCreateRoom(partnerName);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setLastAttemptMode('join');
    onJoinRoom(sanitizedCode, partnerName);
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:py-14">
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col justify-between lg:col-span-7">
          <div>
            <p className="text-sm font-medium text-[#D94B6A]">
              Shared Date-Night Room · Real-Time Sync
            </p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-[#F4F1EC] sm:text-5xl [text-wrap:balance]">
              An intimate table for two, synced in real time.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[#B6B0BA]">
              Open a private room in seconds, share your 6-character invite code, and choose
              tonight&apos;s plan, reveal conversation cards together, and match the evening mood.
            </p>
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="partner-name-input"
                className="block text-sm font-medium text-[#E5E0E8]"
              >
                Your name
              </label>
              <input
                id="partner-name-input"
                type="text"
                maxLength={32}
                value={partnerName}
                onChange={(e) => {
                  onChangeName(e.target.value);
                  if (hasError) onClearError();
                }}
                placeholder="e.g. Aarav or Maya"
                disabled={isBusy}
                className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#19171C] px-4 text-sm text-[#F4F1EC] placeholder:text-[#76707C] focus:border-[#D94B6A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B6A]/40 disabled:opacity-60"
              />
            </div>

            {hasError && errorMessage && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-xl border border-[#F07167]/40 bg-[#2A181B] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F48C84]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#FDE8E6]">
                      {lastAttemptMode === 'create'
                        ? 'Unable to start room'
                        : 'Unable to connect to room'}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#E7B5B0]">
                      {errorMessage}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (lastAttemptMode === 'create') {
                      onCreateRoom(partnerName);
                    } else if (sanitizedCode.length === 6) {
                      onJoinRoom(sanitizedCode, partnerName);
                    } else {
                      onRetry();
                    }
                  }}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg border border-[#F48C84]/40 bg-[#3B2024] px-4 py-2 text-xs font-semibold text-[#FDE8E6] transition-colors hover:bg-[#4D292E] whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <form
                onSubmit={handleCreate}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#19171C] p-6"
              >
                <div>
                  <div className="flex items-center gap-2.5 text-[#F4F1EC]">
                    <Plus className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
                    <h2 className="text-lg font-semibold">Start a new room</h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#A8A2AE]">
                    Generate a fresh 6-character invite code and wait for your partner inside.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B6A] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Generating code...
                    </>
                  ) : (
                    <>
                      Generate Invite Code
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <form
                onSubmit={handleJoin}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#19171C] p-6"
              >
                <div>
                  <div className="flex items-center gap-2.5 text-[#F4F1EC]">
                    <KeyRound className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
                    <h2 className="text-lg font-semibold">Join partner&apos;s room</h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#A8A2AE]">
                    Enter the 6-character code your partner shared with you.
                  </p>

                  <label htmlFor="invite-code-input" className="sr-only">
                    6-character invite code
                  </label>
                  <input
                    id="invite-code-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={6}
                    value={sanitizedCode}
                    onChange={(e) => {
                      const cleaned = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 6);
                      onChangePendingCode(cleaned);
                      if (hasError) onClearError();
                    }}
                    placeholder="K7M9P2"
                    disabled={isBusy}
                    className="mt-4 h-11 w-full rounded-xl border border-white/15 bg-[#121115] px-4 text-center font-mono text-base font-semibold tracking-[0.28em] text-[#F4F1EC] uppercase placeholder:tracking-[0.2em] placeholder:text-[#5E5863] focus:border-[#D94B6A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B6A]/40 disabled:opacity-60 tabular-nums"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isBusy || sanitizedCode.length !== 6}
                  className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#26232A] px-5 py-2.5 text-sm font-semibold text-[#F4F1EC] transition-colors hover:bg-[#312D36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B6A] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Join Room
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8E8894]">
              <span>Unique 6-character codes</span>
              <span aria-hidden="true">·</span>
              <span>Private 2-partner limit</span>
              <span aria-hidden="true">·</span>
              <span>Instant WebSocket sync</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="relative h-full min-h-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#19171C]">
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/kulfi_evening_table_1794925458574.jpg"
                alt="Two pistachio and saffron kulfi desserts in brass bowls on a candlelit slate table"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover lg:min-h-[500px]"
              />
            ) : (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center bg-gradient-to-br from-[#231922] via-[#19171C] to-[#131215] p-8 text-center">
                <Sparkles className="h-8 w-8 text-[#D94B6A]" aria-hidden="true" />
                <p className="mt-3 font-display text-lg text-[#F4F1EC]">
                  KulfiSync Evening Lounge
                </p>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111013]/90 via-[#111013]/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="font-display text-xl font-medium text-[#F4F1EC]">
                Dessert first, decisions together.
              </p>
              <p className="mt-1 text-sm text-[#D1CBD6]">
                Every vote, card flip, and mood shift appears on both screens the moment it happens.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="Past Date-Night Rooms"
        className="mt-14 border-t border-white/10 pt-10"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#F4F1EC]">
              <History className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Past Date-Night Rooms</h2>
            </div>
            <p className="mt-1 text-sm text-[#A8A2AE]">
              Rejoin an archived room code to revisit saved canvas snapshots and daily couple game scores.
            </p>
          </div>

          {authReady && user && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs text-[#A8A2AE]">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                disabled={loadingPastRooms}
                onClick={onRefreshPastRooms}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#19171C] px-3 py-1.5 text-xs font-medium text-[#E5E0E8] hover:bg-[#26232B] disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPastRooms ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#19171C] px-3 py-1.5 text-xs font-medium text-[#B6B0BA] hover:bg-[#26232B] whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign Out
              </button>
            </div>
          )}
        </div>

        <div className="mt-6">
          {!authReady ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#19171C] p-6">
              <Loader2 className="h-5 w-5 animate-spin text-[#D94B6A]" aria-hidden="true" />
              <p className="text-sm text-[#B6B0BA]">Checking account session...</p>
            </div>
          ) : !user ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#19171C] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-[#F4F1EC]">
                  Keep your date-night memories across sessions
                </p>
                <p className="mt-1 text-sm text-[#A8A2AE]">
                  Sign in with Google to view your past rooms, saved drawings, and match scores whenever you come back.
                </p>
                {authError && (
                  <p className="mt-2 text-xs text-[#F48C84]">{authError}</p>
                )}
              </div>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={onSignIn}
                className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#26232A] border border-white/15 px-5 py-2 text-xs font-semibold text-[#F4F1EC] transition-colors hover:bg-[#322E38] disabled:opacity-60 whitespace-nowrap"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                    Sign in with Google
                  </>
                )}
              </button>
            </div>
          ) : loadingPastRooms ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#19171C] p-6">
              <Loader2 className="h-5 w-5 animate-spin text-[#D94B6A]" aria-hidden="true" />
              <p className="text-sm text-[#B6B0BA]">Loading your archived date-night rooms...</p>
            </div>
          ) : pastRoomsError ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-2xl border border-[#F07167]/40 bg-[#28171A] p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F48C84]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-[#FDE8E6]">
                    Could not load past rooms
                  </p>
                  <p className="mt-0.5 text-xs text-[#E7B5B0]">{pastRoomsError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onRefreshPastRooms}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-[#F48C84]/40 bg-[#3B2024] px-4 py-1.5 text-xs font-semibold text-[#FDE8E6] hover:bg-[#4E292E] whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : pastRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#161419] px-6 py-8 text-center">
              <p className="text-base font-medium text-[#F4F1EC]">
                No archived date-night rooms yet
              </p>
              <p className="mt-1 text-sm text-[#A8A2AE]">
                Start or join a room while signed in—your room code, snapshots, and couple game scores will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastRooms.map((item) => (
                <article
                  key={item.code}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#19171C] p-5"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-lg font-semibold tracking-[0.2em] text-[#F4F1EC] tabular-nums">
                        {item.code}
                      </span>
                      <span className="text-xs text-[#8E8894]">
                        {new Intl.DateTimeFormat(undefined, {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(item.updatedAtMs))}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-[#D1CBD6]">
                      {item.partnerNames.length > 0
                        ? item.partnerNames.join(' & ')
                        : 'Private room'}
                    </p>
                    <p className="mt-2 text-xs text-[#9D97A4]">
                      {item.snapshotCount} snapshots · {item.gameCount} games · {item.lastCraving}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onRejoinArchivedRoom(item.code)}
                    className="mt-5 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#232028] px-4 py-2 text-xs font-semibold text-[#F4F1EC] transition-colors hover:bg-[#2F2B36] disabled:opacity-50 whitespace-nowrap"
                  >
                    Rejoin Room
                    <ArrowRight className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section
        id="rituals"
        className="mt-16 border-t border-white/10 pt-12 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center"
      >
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#19171C]">
            {!cardsImgFailed ? (
              <img
                src="/src/assets/images/ritual_cards_linen_1794925457622.jpg"
                alt="Cotton paper conversation prompt cards beside a ceramic espresso cup on walnut wood"
                referrerPolicy="no-referrer"
                onError={() => setCardsImgFailed(true)}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-[#19171C] p-6">
                <p className="font-display text-lg text-[#D1CBD6]">Pillow Talk Prompt Cards</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          <h2 className="text-2xl font-semibold text-[#F4F1EC] sm:text-3xl [text-wrap:balance]">
            Three quiet rituals designed for two screens
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <p className="font-mono text-xs text-[#D94B6A] tabular-nums">01.</p>
              <h3 className="mt-2 text-base font-semibold text-[#F4F1EC]">
                Match tonight&apos;s plan
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#A8A2AE]">
                Vote on curated or custom date ideas independently—mutual Yes picks lock in instantly.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-[#D94B6A] tabular-nums">02.</p>
              <h3 className="mt-2 text-base font-semibold text-[#F4F1EC]">
                Simultaneous reveal
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#A8A2AE]">
                Write your answer to the same prompt card; neither partner can peek until both submit.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-[#D94B6A] tabular-nums">03.</p>
              <h3 className="mt-2 text-base font-semibold text-[#F4F1EC]">
                Sync craving &amp; mood
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#A8A2AE]">
                Dial in energy, dessert craving, soundtrack, and send gentle real-time nudges.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
