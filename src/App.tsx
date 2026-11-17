import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  Copy,
  Heart,
  Link2,
  Loader2,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { CoupleGamePanel } from './components/CoupleGamePanel.tsx';
import { DateMenuPanel } from './components/DateMenuPanel.tsx';
import { MemoriesPanel } from './components/MemoriesPanel.tsx';
import { QuestionDeckPanel } from './components/QuestionDeckPanel.tsx';
import { RoomConnectionScreen } from './components/RoomConnectionScreen.tsx';
import { SharedCanvasPanel } from './components/SharedCanvasPanel.tsx';
import { SharedNotesPanel } from './components/SharedNotesPanel.tsx';
import { VibeSyncPanel } from './components/VibeSyncPanel.tsx';
import { useFirebaseMemories } from './hooks/useFirebaseMemories.ts';
import { useKulfiRoom } from './hooks/useKulfiRoom.ts';

type RoomTab = 'menu' | 'deck' | 'canvas' | 'game' | 'memories' | 'vibe' | 'notes';

const ROOM_TABS: { key: RoomTab; label: string }[] = [
  { key: 'menu', label: 'Date Menu' },
  { key: 'deck', label: 'Question Deck' },
  { key: 'canvas', label: 'Drawing Canvas' },
  { key: 'game', label: 'Couple Game' },
  { key: 'memories', label: 'Memories' },
  { key: 'vibe', label: 'Mood & Vibe' },
  { key: 'notes', label: 'Shared Notes' },
];

const HEADER_ROOM_TABS: { key: RoomTab; label: string }[] = [
  { key: 'menu', label: 'Date Menu' },
  { key: 'canvas', label: 'Canvas' },
  { key: 'game', label: 'Couple Game' },
  { key: 'memories', label: 'Memories' },
  { key: 'notes', label: 'Notes' },
];

export default function App() {
  const {
    myPartnerId,
    partnerName,
    setPartnerName,
    pendingCode,
    setPendingCode,
    status,
    errorMessage,
    reconnectAttempt,
    room,
    partnerLiveStroke,
    isGeneratingGame,
    gameGenerateError,
    clearGameGenerateError,
    matchBanner,
    dismissMatchBanner,
    nudgeBanner,
    dismissNudgeBanner,
    createRoom,
    joinRoom,
    retryConnection,
    leaveRoom,
    resetError,
    voteActivity,
    addActivity,
    toggleActivityComplete,
    removeActivity,
    nextCard,
    prevCard,
    shuffleDeck,
    submitAnswer,
    revealAnswers,
    updateVibe,
    sendNudge,
    addNote,
    setTypingNote,
    sendLiveStroke,
    commitStroke,
    undoCanvas,
    clearCanvas,
    loadSnapshotStrokes,
    generateCoupleGame,
    answerCoupleGame,
    nextCoupleGameCard,
    prevCoupleGameCard,
    jumpCoupleGameCard,
    revealCoupleGameCard,
    resetCoupleGame,
  } = useKulfiRoom();

  const {
    user,
    authReady,
    authError,
    isSigningIn,
    signInWithGoogle,
    signOutUser,
    pastRooms,
    loadingPastRooms,
    pastRoomsError,
    refreshPastRooms,
    snapshots,
    gameHistory,
    loadingMemories,
    memoriesError,
    isSavingSnapshot,
    isSavingGame,
    savedGameIds,
    saveSnapshot,
    saveCompletedGame,
    removeSnapshot,
    removeGameRecord,
  } = useFirebaseMemories(room, partnerName);

  const [activeTab, setActiveTab] = useState<RoomTab>('menu');
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  const isInRoom = Boolean(room);
  const isConnected = status === 'connected';
  const isReconnecting = status === 'reconnecting';
  const isDisconnected = status === 'disconnected' || (isInRoom && status === 'error');

  const normalizedGameId = room?.coupleGame
    ? room.coupleGame.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    : '';
  const isCurrentGameSaved = Boolean(normalizedGameId && savedGameIds[normalizedGameId]);

  const otherPartner = room
    ? room.partners.find((p) => p.id !== myPartnerId) || null
    : null;
  const mePartner = room
    ? room.partners.find((p) => p.id === myPartnerId) || null
    : null;

  const copyInvite = async (mode: 'code' | 'link') => {
    if (!room) return;
    const textToCopy =
      mode === 'code'
        ? room.code
        : `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedType(mode);
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // Clipboard blocked in non-HTTPS context; fallback quietly
    }
  };

  return (
    <div className="min-h-screen bg-[#111013] text-[#F4F1EC]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#111013]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-8 px-6 py-4">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              if (isInRoom) leaveRoom();
            }}
            className="font-display text-xl font-semibold tracking-tight text-[#F4F1EC] whitespace-nowrap shrink-0"
          >
            KulfiSync
          </a>

          {isInRoom ? (
            <nav
              aria-label="Room sections"
              className="hidden md:flex items-center gap-6 text-sm font-medium"
            >
              {HEADER_ROOM_TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'border-[#D94B6A] text-[#F4F1EC]'
                        : 'border-transparent text-[#9D97A4] hover:text-[#F4F1EC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <nav
              aria-label="Overview"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-[#9D97A4]"
            >
              <a
                href="#rituals"
                className="transition-colors hover:text-[#F4F1EC] whitespace-nowrap shrink-0"
              >
                Date Rituals
              </a>
              <a
                href="#rituals"
                className="transition-colors hover:text-[#F4F1EC] whitespace-nowrap shrink-0"
              >
                How Sync Works
              </a>
            </nav>
          )}

          <div className="shrink-0">
            {isInRoom ? (
              <button
                type="button"
                onClick={leaveRoom}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/15 bg-[#19171C] px-4 py-2 text-xs font-semibold text-[#E5E0E8] transition-colors hover:bg-[#26232B] whitespace-nowrap shrink-0"
              >
                Leave Room
              </button>
            ) : (
              <button
                type="button"
                disabled={status === 'creating' || status === 'joining'}
                onClick={() => void createRoom(partnerName)}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#D94B6A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {status === 'creating' ? 'Creating...' : 'Create Room'}
              </button>
            )}
          </div>
        </div>
      </header>

      {!isInRoom && status === 'joining' && pendingCode.length === 6 && (
        <div className="mx-auto max-w-[1200px] px-6 pt-8">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#19171C] p-5">
            <Loader2 className="h-5 w-5 animate-spin text-[#D94B6A]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#F4F1EC]">
                Connecting to room {pendingCode}...
              </p>
              <p className="text-xs text-[#A8A2AE]">
                Syncing live room state over WebSocket.
              </p>
            </div>
          </div>
        </div>
      )}

      {!room ? (
        <RoomConnectionScreen
          partnerName={partnerName}
          onChangeName={setPartnerName}
          pendingCode={pendingCode}
          onChangePendingCode={setPendingCode}
          status={status}
          errorMessage={errorMessage}
          onCreateRoom={(name) => void createRoom(name)}
          onJoinRoom={(code, name) => void joinRoom(code, name)}
          onRetry={retryConnection}
          onClearError={resetError}
          user={user}
          authReady={authReady}
          authError={authError}
          isSigningIn={isSigningIn}
          pastRooms={pastRooms}
          loadingPastRooms={loadingPastRooms}
          pastRoomsError={pastRoomsError}
          onSignIn={() => void signInWithGoogle()}
          onSignOut={() => void signOutUser()}
          onRefreshPastRooms={() => void refreshPastRooms()}
          onRejoinArchivedRoom={(code) =>
            void joinRoom(code, partnerName.trim() || user?.displayName || 'Partner')
          }
        />
      ) : (
        <main className="mx-auto w-full max-w-[1200px] px-6 py-8 space-y-6">
          {(isReconnecting || isDisconnected) && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-2xl border border-[#F07167]/40 bg-[#28171A] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                {isReconnecting ? (
                  <Loader2
                    className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#F48C84]"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#F48C84]"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold text-[#FDE8E6]">
                    {isReconnecting
                      ? `Reconnecting to room ${room.code} (attempt ${reconnectAttempt} of 4)...`
                      : `Disconnected from room ${room.code}`}
                  </p>
                  <p className="mt-0.5 text-xs text-[#E7B5B0]">
                    {errorMessage ||
                      'Live changes are paused until the WebSocket connection is restored.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={retryConnection}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-[#F48C84]/40 bg-[#3B2024] px-4 py-2 text-xs font-semibold text-[#FDE8E6] transition-colors hover:bg-[#4E292E] whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry Connection
              </button>
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#19171C] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-medium text-[#9D97A4]">Room Code</span>
                <span className="font-mono text-lg font-semibold tracking-[0.2em] text-[#F4F1EC] tabular-nums">
                  {room.code}
                </span>
                <button
                  type="button"
                  onClick={() => void copyInvite('code')}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#232028] px-2.5 py-1 text-xs font-medium text-[#E5E0E8] hover:bg-[#2E2A35] whitespace-nowrap"
                >
                  {copiedType === 'code' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#52B788]" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void copyInvite('link')}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#232028] px-2.5 py-1 text-xs font-medium text-[#E5E0E8] hover:bg-[#2E2A35] whitespace-nowrap"
                >
                  {copiedType === 'link' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#52B788]" aria-hidden="true" />
                      Link Copied
                    </>
                  ) : (
                    <>
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Share Link
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#A8A2AE]">
              <span>
                You: <strong className="font-semibold text-[#F4F1EC]">{mePartner?.name || partnerName}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Partner:{' '}
                {otherPartner ? (
                  <strong className="font-semibold text-[#F4F1EC]">
                    {otherPartner.name} ({otherPartner.connected ? 'In room' : 'Offline'})
                  </strong>
                ) : (
                  <span>Not joined yet</span>
                )}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                {isConnected ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-[#52B788]" aria-hidden="true" />
                    <Wifi className="h-3.5 w-3.5 text-[#52B788]" aria-hidden="true" />
                    <span className="text-[#8CE0B4]">Live sync</span>
                  </>
                ) : isReconnecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F4B942]" aria-hidden="true" />
                    <span className="text-[#F4B942]">Reconnecting</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-[#F48C84]" aria-hidden="true" />
                    <span className="text-[#F48C84]">Disconnected</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {!otherPartner && (
            <div className="flex flex-col gap-5 rounded-2xl border border-dashed border-white/20 bg-[#161419] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#221F26]">
                  <Users className="h-5 w-5 text-[#D94B6A]" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#F4F1EC]">
                    Waiting for your partner to join (1 of 2 connected)
                  </h2>
                  <p className="mt-1 text-sm text-[#A8A2AE]">
                    Share invite code{' '}
                    <span className="font-mono font-semibold text-[#F4F1EC] tabular-nums">
                      {room.code}
                    </span>{' '}
                    or send your room link. You can start picking ideas right away—everything syncs the instant they arrive.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void copyInvite('link')}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] whitespace-nowrap"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {copiedType === 'link' ? 'Invite Link Copied' : 'Copy Invite Link'}
              </button>
            </div>
          )}

          <AnimatePresence>
            {matchBanner && (
              <motion.div
                key={matchBanner.at}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[#D94B6A]/50 bg-[#2B1922] px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <Heart className="h-5 w-5 shrink-0 fill-current text-[#F08099]" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#FDE8EE]">
                    Mutual match! You both picked <strong>{matchBanner.title}</strong> for tonight.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissMatchBanner}
                  aria-label="Dismiss match notification"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#E7B5C2] hover:bg-white/10"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </motion.div>
            )}

            {nudgeBanner && (
              <motion.div
                key={nudgeBanner.at}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[#52B788]/40 bg-[#17261F] px-5 py-3.5"
              >
                <p className="text-sm font-medium text-[#E4F7ED]">
                  <strong>{nudgeBanner.fromName}</strong> sent a nudge: &ldquo;{nudgeBanner.message}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={dismissNudgeBanner}
                  aria-label="Dismiss nudge"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#A7DFC1] hover:bg-white/10"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            role="tablist"
            aria-label="Room workspace tabs"
            className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-[#161419] p-1.5"
          >
            {ROOM_TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[40px] flex-1 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#D94B6A] text-white'
                      : 'text-[#A8A2AE] hover:text-[#F4F1EC]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            {activeTab === 'menu' && (
              <DateMenuPanel
                activities={room.activities}
                partners={room.partners}
                myPartnerId={myPartnerId}
                isConnected={isConnected}
                onVote={voteActivity}
                onAddActivity={addActivity}
                onToggleComplete={toggleActivityComplete}
                onRemoveActivity={removeActivity}
              />
            )}

            {activeTab === 'deck' && (
              <QuestionDeckPanel
                deck={room.deck}
                questionRound={room.questionRound}
                partners={room.partners}
                myPartnerId={myPartnerId}
                isConnected={isConnected}
                onPrev={prevCard}
                onNext={nextCard}
                onShuffle={shuffleDeck}
                onSubmitAnswer={submitAnswer}
                onReveal={revealAnswers}
              />
            )}

            {activeTab === 'canvas' && (
              <SharedCanvasPanel
                strokes={room.canvasStrokes}
                partnerLiveStroke={partnerLiveStroke}
                myPartnerId={myPartnerId}
                myPartnerName={mePartner?.name || partnerName}
                isConnected={isConnected}
                isSignedIn={Boolean(user)}
                isSavingSnapshot={isSavingSnapshot}
                onSendLiveStroke={sendLiveStroke}
                onCommitStroke={commitStroke}
                onUndo={undoCanvas}
                onClear={clearCanvas}
                onSignIn={() => void signInWithGoogle()}
                onSaveSnapshot={async (title) => {
                  await saveSnapshot(title, room.canvasStrokes);
                }}
              />
            )}

            {activeTab === 'game' && (
              <CoupleGamePanel
                coupleGame={room.coupleGame}
                isGeneratingRemote={room.coupleGameGenerating}
                isGeneratingLocal={isGeneratingGame}
                generateError={gameGenerateError}
                partners={room.partners}
                myPartnerId={myPartnerId}
                isConnected={isConnected}
                isSignedIn={Boolean(user)}
                isSavingGame={isSavingGame}
                isGameSaved={isCurrentGameSaved}
                onGenerate={(mode, mood) => void generateCoupleGame(mode, mood)}
                onClearError={clearGameGenerateError}
                onAnswer={answerCoupleGame}
                onNext={nextCoupleGameCard}
                onPrev={prevCoupleGameCard}
                onJump={jumpCoupleGameCard}
                onReveal={revealCoupleGameCard}
                onReset={resetCoupleGame}
                onSignIn={() => void signInWithGoogle()}
                onSaveGame={async () => {
                  if (room.coupleGame) {
                    await saveCompletedGame(room.coupleGame);
                  }
                }}
              />
            )}

            {activeTab === 'memories' && (
              <MemoriesPanel
                roomCode={room.code}
                vibe={room.vibe}
                user={user}
                authReady={authReady}
                authError={authError}
                isSigningIn={isSigningIn}
                snapshots={snapshots}
                gameHistory={gameHistory}
                loadingMemories={loadingMemories}
                memoriesError={memoriesError}
                isConnected={isConnected}
                onSignIn={() => void signInWithGoogle()}
                onSignOut={() => void signOutUser()}
                onRestoreSnapshot={(strokes) => {
                  loadSnapshotStrokes(strokes);
                }}
                onDeleteSnapshot={removeSnapshot}
                onDeleteGameRecord={removeGameRecord}
              />
            )}

            {activeTab === 'vibe' && (
              <VibeSyncPanel
                vibe={room.vibe}
                isConnected={isConnected}
                onUpdateVibe={updateVibe}
                onSendNudge={sendNudge}
              />
            )}

            {activeTab === 'notes' && (
              <SharedNotesPanel
                notes={room.notes}
                partners={room.partners}
                myPartnerId={myPartnerId}
                isConnected={isConnected}
                onAddNote={addNote}
                onTypingChange={setTypingNote}
              />
            )}
          </div>
        </main>
      )}
    </div>
  );
}
