import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Loader2,
  Lock,
  LogIn,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { CoupleGameMode, CoupleGameRound, Partner } from '../types/room.ts';

interface CoupleGamePanelProps {
  coupleGame: CoupleGameRound | null;
  isGeneratingRemote: boolean;
  isGeneratingLocal: boolean;
  generateError: string | null;
  partners: Partner[];
  myPartnerId: string;
  isConnected: boolean;
  isSignedIn: boolean;
  isSavingGame: boolean;
  isGameSaved: boolean;
  onGenerate: (mode: CoupleGameMode, moodTag: string) => void;
  onClearError: () => void;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onJump: (index: number) => void;
  onReveal: (questionId: string) => void;
  onReset: () => void;
  onSignIn: () => void;
  onSaveGame: () => Promise<void>;
}

const MOOD_TAGS = [
  'Playful',
  'Cozy & Nostalgic',
  'Deep & Romantic',
  'Adventurous',
  'Foodie & Late-Night',
];

const MODE_OPTIONS: { key: CoupleGameMode; label: string; hint: string }[] = [
  {
    key: 'know_me',
    label: 'How Well Do You Know Me?',
    hint: '4 tailored choices per card—see if your answers align',
  },
  {
    key: 'would_you_rather',
    label: 'Would You Rather',
    hint: '2 evening dilemmas per card—lock picks & reveal together',
  },
];

export function CoupleGamePanel({
  coupleGame,
  isGeneratingRemote,
  isGeneratingLocal,
  generateError,
  partners,
  myPartnerId,
  isConnected,
  isSignedIn,
  isSavingGame,
  isGameSaved,
  onGenerate,
  onClearError,
  onAnswer,
  onNext,
  onPrev,
  onJump,
  onReveal,
  onReset,
  onSignIn,
  onSaveGame,
}: CoupleGamePanelProps) {
  const [selectedMode, setSelectedMode] = useState<CoupleGameMode>(
    coupleGame?.mode || 'know_me'
  );
  const [selectedMood, setSelectedMood] = useState<string>(
    coupleGame?.moodTag || MOOD_TAGS[0]
  );
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoSavedRoundIdRef = useRef<string | null>(null);

  const isGenerating = isGeneratingRemote || isGeneratingLocal;
  const otherPartner = partners.find((p) => p.id !== myPartnerId) || null;
  const mePartner = partners.find((p) => p.id === myPartnerId) || null;

  const handleGenerate = () => {
    setShowSummary(false);
    setSaveError(null);
    onGenerate(selectedMode, selectedMood);
  };

  // Compute live match metrics across all 5 questions
  const totalQuestions = coupleGame?.questions.length || 0;
  let revealedCount = 0;
  let matchCount = 0;

  if (coupleGame && otherPartner) {
    for (const q of coupleGame.questions) {
      const isRev = Boolean(coupleGame.revealedQuestions[q.id]);
      const ans = coupleGame.answers[q.id] || {};
      if (isRev && ans[myPartnerId] !== undefined && ans[otherPartner.id] !== undefined) {
        revealedCount += 1;
        if (ans[myPartnerId] === ans[otherPartner.id]) {
          matchCount += 1;
        }
      }
    }
  }

  const handleSaveScore = async () => {
    if (!coupleGame || isSavingGame || isGameSaved) return;
    setSaveError(null);
    try {
      await onSaveGame();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save game score.');
    }
  };

  useEffect(() => {
    if (
      !coupleGame ||
      !isSignedIn ||
      isGameSaved ||
      isSavingGame ||
      totalQuestions === 0 ||
      revealedCount < totalQuestions
    ) {
      return;
    }
    if (autoSavedRoundIdRef.current === coupleGame.id) {
      return;
    }
    autoSavedRoundIdRef.current = coupleGame.id;
    void onSaveGame().catch((err) => {
      setSaveError(err instanceof Error ? err.message : 'Unable to auto-save game score.');
    });
  }, [coupleGame, isSignedIn, isGameSaved, isSavingGame, revealedCount, totalQuestions, onSaveGame]);

  const currentQuestion = coupleGame?.questions[coupleGame.currentIndex] || null;
  const currentAnswers =
    coupleGame && currentQuestion ? coupleGame.answers[currentQuestion.id] || {} : {};
  const currentSubmitted =
    coupleGame && currentQuestion
      ? coupleGame.submittedByQuestion[currentQuestion.id] || []
      : [];
  const currentRevealed =
    coupleGame && currentQuestion
      ? Boolean(coupleGame.revealedQuestions[currentQuestion.id])
      : false;

  const myChoice = currentAnswers[myPartnerId];
  const partnerChoice = otherPartner ? currentAnswers[otherPartner.id] : undefined;
  const iSubmitted = currentSubmitted.includes(myPartnerId);
  const partnerSubmitted = otherPartner ? currentSubmitted.includes(otherPartner.id) : false;
  const currentMatched =
    currentRevealed &&
    myChoice !== undefined &&
    partnerChoice !== undefined &&
    myChoice === partnerChoice;

  return (
    <section aria-label="AI Daily Couple Game" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#F4F1EC]">AI Daily Couple Game</h2>
          <p className="mt-1 text-sm text-[#A8A2AE]">
            Choose a game format and evening mood to generate a fresh 5-question deck for both partners.
          </p>
        </div>

        {coupleGame && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSummary((prev) => !prev)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/15 bg-[#221F26] px-4 py-2 text-xs font-medium text-[#F4F1EC] hover:bg-[#2D2933] whitespace-nowrap"
            >
              {showSummary ? 'Back to Active Card' : 'Round Summary'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSummary(false);
                onReset();
              }}
              disabled={!isConnected || isGenerating}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#19171C] px-3.5 py-2 text-xs font-medium text-[#B6B0BA] hover:text-[#F4F1EC] disabled:opacity-40 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              New Setup
            </button>
          </div>
        )}
      </div>

      {generateError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-[#F07167]/40 bg-[#28171A] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F48C84]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#FDE8E6]">
                Could not generate couple game deck
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#E7B5B0]">
                {generateError}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClearError}
              className="min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-medium text-[#E7B5B0] hover:text-white whitespace-nowrap"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={!isConnected || isGenerating}
              onClick={handleGenerate}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#F48C84]/40 bg-[#3B2024] px-4 py-1.5 text-xs font-semibold text-[#FDE8E6] hover:bg-[#4D292E] disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}

      {isGenerating ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#19171C] px-6 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D94B6A]" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-semibold text-[#F4F1EC]">
            Crafting 5 custom cards...
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-[#A8A2AE]">
            Building a {selectedMode === 'would_you_rather' ? 'Would You Rather' : 'How Well Do You Know Me?'}{' '}
            deck tuned for a <span className="text-[#F4F1EC]">{selectedMood}</span> evening.
          </p>
        </div>
      ) : !coupleGame ? (
        <div className="rounded-2xl border border-white/10 bg-[#19171C] p-6 sm:p-8 space-y-7">
          <div>
            <p className="text-xs font-semibold text-[#D94B6A]">01. Choose game mode</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MODE_OPTIONS.map((opt) => {
                const active = selectedMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedMode(opt.key)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      active
                        ? 'border-[#D94B6A] bg-[#281A22]'
                        : 'border-white/10 bg-[#121115] hover:bg-[#211E26]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#F4F1EC]">{opt.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#A8A2AE]">{opt.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/10 pt-6">
            <p className="text-xs font-semibold text-[#D94B6A]">02. Select tonight&apos;s mood tag</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MOOD_TAGS.map((tag) => {
                const active = selectedMood === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedMood(tag)}
                    className={`min-h-[42px] rounded-xl border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'border-[#D94B6A] bg-[#D94B6A] text-white'
                        : 'border-white/10 bg-[#121115] text-[#B6B0BA] hover:bg-[#232028] hover:text-[#F4F1EC]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#9D97A4]">
              Generates 5 synced cards for both screens · Hidden picks until both answer
            </p>
            <button
              type="button"
              disabled={!isConnected || isGenerating}
              onClick={handleGenerate}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Generate 5-Card Deck
            </button>
          </div>
        </div>
      ) : showSummary ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#19171C] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-[#D94B6A]">
                {coupleGame.mode === 'would_you_rather'
                  ? 'Would You Rather'
                  : 'How Well Do You Know Me?'}{' '}
                · {coupleGame.moodTag}
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-[#F4F1EC] tabular-nums">
                {matchCount} of {totalQuestions} Matches
              </h3>
              <p className="mt-1 text-sm text-[#A8A2AE]">
                {revealedCount < totalQuestions
                  ? `${revealedCount} of ${totalQuestions} cards completed so far.`
                  : 'All 5 cards revealed for tonight.'}
              </p>
              {saveError && (
                <p className="mt-2 text-xs text-[#F48C84]">{saveError}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isGameSaved ? (
                <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#52B788]/40 bg-[#17261F] px-4 py-2 text-xs font-semibold text-[#8CE0B4] whitespace-nowrap">
                  <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                  Saved to Memories
                </span>
              ) : isSignedIn ? (
                <button
                  type="button"
                  disabled={isSavingGame}
                  onClick={() => void handleSaveScore()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#221F26] px-4 py-2.5 text-xs font-semibold text-[#F4F1EC] hover:bg-[#2E2A34] disabled:opacity-50 whitespace-nowrap"
                >
                  {isSavingGame ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                      Save Round Score
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#221F26] px-4 py-2.5 text-xs font-semibold text-[#F4F1EC] hover:bg-[#2E2A34] whitespace-nowrap"
                >
                  <LogIn className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                  Sign in to Save Score
                </button>
              )}
              <button
                type="button"
                disabled={!isConnected}
                onClick={() => {
                  setShowSummary(false);
                  setSaveError(null);
                  onGenerate(coupleGame.mode, coupleGame.moodTag);
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C63D5B] disabled:opacity-50 whitespace-nowrap"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Play Fresh 5 Cards
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {coupleGame.questions.map((q, idx) => {
              const qAns = coupleGame.answers[q.id] || {};
              const qRev = Boolean(coupleGame.revealedQuestions[q.id]);
              const mine = qAns[myPartnerId];
              const theirs = otherPartner ? qAns[otherPartner.id] : undefined;
              const isMatch = qRev && mine !== undefined && theirs !== undefined && mine === theirs;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    onJump(idx);
                    setShowSummary(false);
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-[#19171C] p-5 text-left transition-colors hover:border-white/25"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9D97A4]">
                    <span className="font-mono tabular-nums">Card 0{idx + 1}</span>
                    {qRev ? (
                      isMatch ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#52B788]">
                          <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                          Matched
                        </span>
                      ) : (
                        <span className="text-[#D1CBD6]">Different picks</span>
                      )
                    ) : (
                      <span>Not revealed yet</span>
                    )}
                  </div>
                  <p className="mt-2 text-base font-medium text-[#F4F1EC]">{q.prompt}</p>
                  {qRev && (
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#B6B0BA]">
                      <span>
                        {mePartner?.name || 'You'}:{' '}
                        <strong className="text-[#F4F1EC]">
                          {mine !== undefined ? q.options[mine] : 'No pick'}
                        </strong>
                      </span>
                      {otherPartner && (
                        <span>
                          {otherPartner.name}:{' '}
                          <strong className="text-[#F4F1EC]">
                            {theirs !== undefined ? q.options[theirs] : 'No pick'}
                          </strong>
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : currentQuestion ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#161419] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A8A2AE]">
              <span className="font-semibold text-[#F4F1EC]">
                {coupleGame.mode === 'would_you_rather'
                  ? 'Would You Rather'
                  : 'How Well Do You Know Me?'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-[#F08099]">{coupleGame.moodTag}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#8CE0B4]">
                {matchCount}/{totalQuestions} matched
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {coupleGame.questions.map((q, idx) => {
                const isActive = idx === coupleGame.currentIndex;
                const rev = Boolean(coupleGame.revealedQuestions[q.id]);
                const qAns = coupleGame.answers[q.id] || {};
                const matched =
                  rev &&
                  otherPartner &&
                  qAns[myPartnerId] !== undefined &&
                  qAns[myPartnerId] === qAns[otherPartner.id];

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => onJump(idx)}
                    aria-label={`Question ${idx + 1}`}
                    className={`min-h-[36px] min-w-[36px] rounded-lg border font-mono text-xs font-semibold transition-colors tabular-nums ${
                      isActive
                        ? 'border-[#D94B6A] bg-[#D94B6A] text-white'
                        : matched
                          ? 'border-[#52B788]/50 bg-[#17261F] text-[#8CE0B4]'
                          : 'border-white/10 bg-[#19171C] text-[#A8A2AE] hover:text-[#F4F1EC]'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#19171C] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 text-xs text-[#9D97A4]">
              <span className="font-mono tabular-nums">
                Card 0{coupleGame.currentIndex + 1} / 0{totalQuestions}
              </span>
              {currentRevealed ? (
                currentMatched ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#52B788]">
                    <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    Both picked the same!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#D1CBD6]">
                    <Eye className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                    Answers revealed
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#D1CBD6]">
                  <Lock className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                  {partnerSubmitted && !iSubmitted
                    ? `${otherPartner?.name || 'Partner'} picked — choose yours to reveal`
                    : iSubmitted && !partnerSubmitted
                      ? otherPartner
                        ? `Waiting for ${otherPartner.name}'s pick`
                        : 'Locked in while waiting for partner'
                      : 'Hidden until both partners pick'}
                </span>
              )}
            </div>

            <h3 className="mt-5 font-display text-2xl font-medium leading-snug text-[#F4F1EC] sm:text-3xl [text-wrap:balance]">
              {currentQuestion.prompt}
            </h3>

            <div
              className={`mt-7 grid gap-3 ${
                currentQuestion.options.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {currentQuestion.options.map((optionText, idx) => {
                const isMyPick = myChoice === idx;
                const isPartnerPick = currentRevealed && partnerChoice === idx;
                const bothPickedThis = isMyPick && isPartnerPick;

                return (
                  <button
                    key={`${currentQuestion.id}-${idx}`}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => onAnswer(currentQuestion.id, idx)}
                    className={`flex min-h-[56px] flex-col justify-between gap-2 rounded-xl border p-4 text-left transition-colors disabled:opacity-50 ${
                      bothPickedThis
                        ? 'border-[#52B788] bg-[#182921]'
                        : isMyPick
                          ? 'border-[#D94B6A] bg-[#2B1B23]'
                          : isPartnerPick
                            ? 'border-white/30 bg-[#242029]'
                            : 'border-white/10 bg-[#121115] hover:border-white/25 hover:bg-[#1E1B22]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium leading-snug text-[#F4F1EC]">
                        {optionText}
                      </span>
                      {isMyPick && (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F08099]" aria-hidden="true" />
                      )}
                    </div>

                    {(isMyPick || isPartnerPick) && (
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#B6B0BA]">
                        {isMyPick && (
                          <span className="font-semibold text-[#F08099]">
                            {mePartner?.name || 'You'}
                          </span>
                        )}
                        {isMyPick && isPartnerPick && <span aria-hidden="true">·</span>}
                        {isPartnerPick && otherPartner && (
                          <span className="font-semibold text-[#8CE0B4]">
                            {otherPartner.name}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isConnected || coupleGame.currentIndex === 0}
                  onClick={onPrev}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#121115] px-4 py-2 text-xs font-medium text-[#E5E0E8] hover:bg-[#232028] disabled:opacity-40 whitespace-nowrap"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </button>

                {coupleGame.currentIndex < totalQuestions - 1 ? (
                  <button
                    type="button"
                    disabled={!isConnected}
                    onClick={onNext}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#26222C] px-4 py-2 text-xs font-semibold text-[#F4F1EC] hover:bg-[#322D39] disabled:opacity-40 whitespace-nowrap"
                  >
                    Next Card
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSummary(true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D94B6A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#C63D5B] whitespace-nowrap"
                  >
                    View Match Summary
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!currentRevealed && currentSubmitted.length > 0 && (
                  <button
                    type="button"
                    disabled={!isConnected}
                    onClick={() => onReveal(currentQuestion.id)}
                    className="text-xs font-medium text-[#F08099] underline-offset-4 hover:underline disabled:opacity-40 whitespace-nowrap"
                  >
                    Reveal Early
                  </button>
                )}

                {revealedCount > 0 &&
                  (isGameSaved ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8CE0B4]">
                      <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Score saved
                    </span>
                  ) : isSignedIn ? (
                    <button
                      type="button"
                      disabled={isSavingGame}
                      onClick={() => void handleSaveScore()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#121115] px-3 py-1.5 text-xs font-medium text-[#E5E0E8] hover:bg-[#232028] disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSavingGame ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <BookmarkPlus className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                      )}
                      Save Score
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#121115] px-3 py-1.5 text-xs font-medium text-[#D1CBD6] hover:bg-[#232028] whitespace-nowrap"
                    >
                      <LogIn className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                      Sign in to Save Score
                    </button>
                  ))}
              </div>
            </div>
            {saveError && (
              <p className="mt-3 text-xs text-[#F48C84]">{saveError}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
