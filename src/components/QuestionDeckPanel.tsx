import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Lock,
  Send,
  Shuffle,
} from 'lucide-react';
import type { Partner, QuestionCard, QuestionRoundState } from '../types/room.ts';

interface QuestionDeckPanelProps {
  deck: QuestionCard[];
  questionRound: QuestionRoundState;
  partners: Partner[];
  myPartnerId: string;
  isConnected: boolean;
  onPrev: () => void;
  onNext: () => void;
  onShuffle: () => void;
  onSubmitAnswer: (text: string) => void;
  onReveal: () => void;
}

const CATEGORY_LABELS: Record<QuestionCard['category'], string> = {
  warm: 'Warm',
  playful: 'Playful',
  deep: 'Deep',
};

export function QuestionDeckPanel({
  deck,
  questionRound,
  partners,
  myPartnerId,
  isConnected,
  onPrev,
  onNext,
  onShuffle,
  onSubmitAnswer,
  onReveal,
}: QuestionDeckPanelProps) {
  const currentCard = deck[questionRound.cardIndex] || deck[0];
  const mySavedAnswer = questionRound.answers[myPartnerId] || '';
  const [draft, setDraft] = useState(mySavedAnswer);

  useEffect(() => {
    setDraft(mySavedAnswer);
  }, [questionRound.cardIndex, currentCard?.id, mySavedAnswer]);

  if (!currentCard) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-[#161419] p-10 text-center">
        <p className="text-base font-medium text-[#F4F1EC]">No conversation cards loaded.</p>
      </div>
    );
  }

  const otherPartner = partners.find((p) => p.id !== myPartnerId) || null;
  const iSubmitted = questionRound.submittedIds.includes(myPartnerId);
  const partnerSubmitted = otherPartner
    ? questionRound.submittedIds.includes(otherPartner.id)
    : false;
  const partnerAnswerText = otherPartner
    ? questionRound.answers[otherPartner.id]
    : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSubmitAnswer(draft.trim());
  };

  return (
    <section aria-label="Question Deck" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#F4F1EC]">Pillow Talk Cards</h2>
          <p className="mt-1 text-sm text-[#A8A2AE]">
            Both partners view the same card. Answers stay hidden until both submit or you reveal together.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={!isConnected}
            aria-label="Previous card"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-white/15 bg-[#19171C] text-[#E5E0E8] hover:bg-[#26232B] disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="px-2 font-mono text-xs text-[#B6B0BA] tabular-nums whitespace-nowrap">
            {String(questionRound.cardIndex + 1).padStart(2, '0')} /{' '}
            {String(deck.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!isConnected}
            aria-label="Next card"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-white/15 bg-[#19171C] text-[#E5E0E8] hover:bg-[#26232B] disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onShuffle}
            disabled={!isConnected}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/15 bg-[#221F26] px-3.5 py-2 text-xs font-medium text-[#F4F1EC] hover:bg-[#2D2933] disabled:opacity-50 whitespace-nowrap"
          >
            <Shuffle className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
            Shuffle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="rounded-2xl border border-white/10 bg-[#19171C] p-8 lg:col-span-6">
          <div className="flex items-center gap-2 text-xs text-[#D94B6A]">
            <span>{CATEGORY_LABELS[currentCard.category]} Prompt</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#9D97A4] tabular-nums">
              Card {questionRound.cardIndex + 1}
            </span>
          </div>

          <blockquote className="mt-6 font-display text-2xl font-medium leading-snug text-[#F4F1EC] sm:text-3xl [text-wrap:balance]">
            &ldquo;{currentCard.prompt}&rdquo;
          </blockquote>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-[#A8A2AE]">
            <div className="flex items-center gap-2">
              {questionRound.revealed ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-[#52B788]">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Answers revealed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#D1CBD6]">
                  <Lock className="h-3.5 w-3.5 text-[#D94B6A]" aria-hidden="true" />
                  {partnerSubmitted && !iSubmitted
                    ? `${otherPartner?.name || 'Partner'} answered — submit yours to reveal`
                    : iSubmitted && !partnerSubmitted
                      ? otherPartner
                        ? `Waiting for ${otherPartner.name}'s answer`
                        : 'Answer locked in while waiting for partner'
                      : 'Hidden until both partners answer'}
                </span>
              )}
            </div>

            {!questionRound.revealed && questionRound.submittedIds.length > 0 && (
              <button
                type="button"
                onClick={onReveal}
                disabled={!isConnected}
                className="font-medium text-[#F08099] underline-offset-4 hover:underline disabled:opacity-50 whitespace-nowrap"
              >
                Reveal Early
              </button>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-6">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/10 bg-[#19171C] p-6"
          >
            <label
              htmlFor="question-answer-input"
              className="block text-sm font-medium text-[#E5E0E8]"
            >
              Your answer
            </label>
            <textarea
              id="question-answer-input"
              rows={4}
              maxLength={400}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!isConnected}
              placeholder="Write something honest for tonight..."
              className="mt-2.5 w-full rounded-xl border border-white/15 bg-[#121115] p-3.5 text-sm leading-relaxed text-[#F4F1EC] placeholder:text-[#6B6470] focus:border-[#D94B6A] focus:outline-none disabled:opacity-60"
            />
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="font-mono text-xs text-[#8E8894] tabular-nums">
                {draft.length} / 400
              </span>
              <button
                type="submit"
                disabled={!isConnected || !draft.trim()}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#D94B6A] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                {iSubmitted ? 'Update Answer' : 'Lock In Answer'}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-white/10 bg-[#161419] p-6">
            <h3 className="text-sm font-semibold text-[#F4F1EC]">
              {otherPartner ? `${otherPartner.name}'s answer` : "Partner's answer"}
            </h3>
            {!otherPartner ? (
              <p className="mt-2 text-sm text-[#8E8894]">
                Waiting for your partner to join this room before answers can sync.
              </p>
            ) : questionRound.revealed && partnerAnswerText ? (
              <p className="mt-2.5 text-base leading-relaxed text-[#F4F1EC]">
                {partnerAnswerText}
              </p>
            ) : partnerSubmitted ? (
              <p className="mt-2 text-sm text-[#D1CBD6]">
                {otherPartner.name} has locked in an answer. Submit yours above to reveal both side by side.
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#8E8894]">
                {otherPartner.name} has not submitted an answer for this card yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
