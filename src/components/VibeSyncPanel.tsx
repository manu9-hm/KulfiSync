import { Flame, Music, Send, Utensils } from 'lucide-react';
import type { VibeState } from '../types/room.ts';

interface VibeSyncPanelProps {
  vibe: VibeState;
  isConnected: boolean;
  onUpdateVibe: (patch: { energy?: number; craving?: string; soundtrack?: string }) => void;
  onSendNudge: (message: string) => void;
}

const ENERGY_LABELS: Record<number, string> = {
  1: '1 · Candlelit Couch',
  2: '2 · Slow & Unhurried',
  3: '3 · Balanced Evening',
  4: '4 · Upbeat & Out',
  5: '5 · Midnight Spontaneous',
};

const CRAVINGS = [
  'Pistachio Kulfi',
  'Masala Chai & Biscuits',
  'Midnight Street Tacos',
  'Gelato Walk',
  'Cheese & Fruit Board',
  'Warm Chocolate Tart',
];

const SOUNDTRACKS = [
  'Rain & Vinyl',
  'Acoustic Dusk',
  'Slow Jazz',
  'Quiet Candlelight',
  'Late-Night Lo-Fi',
];

const QUICK_NUDGES = [
  'Thinking of you',
  'Dessert first?',
  'Ready when you are',
  'Pause for a hug',
];

export function VibeSyncPanel({
  vibe,
  isConnected,
  onUpdateVibe,
  onSendNudge,
}: VibeSyncPanelProps) {
  return (
    <section aria-label="Mood and Vibe Sync" className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#F4F1EC]">Tonight&apos;s Mood &amp; Cravings</h2>
          <p className="mt-1 text-sm text-[#A8A2AE]">
            Adjusting any dial updates both screens immediately.
            {vibe.updatedByName && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-[#D1CBD6]">Last adjusted by {vibe.updatedByName}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 rounded-2xl border border-white/10 bg-[#19171C] p-6 lg:col-span-7">
          <div>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#F4F1EC]">
                <Flame className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
                Evening Energy
              </span>
              <span className="font-mono text-xs text-[#F08099] tabular-nums">
                {ENERGY_LABELS[vibe.energy] || ENERGY_LABELS[2]}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((level) => {
                const active = vibe.energy === level;
                return (
                  <button
                    key={level}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => onUpdateVibe({ energy: level })}
                    className={`min-h-[44px] rounded-xl border font-mono text-sm font-semibold transition-colors disabled:opacity-50 tabular-nums ${
                      active
                        ? 'border-[#D94B6A] bg-[#D94B6A] text-white'
                        : 'border-white/10 bg-[#121115] text-[#B6B0BA] hover:bg-[#232028] hover:text-[#F4F1EC]'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/10 pt-6">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#F4F1EC]">
              <Utensils className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
              Late-Night Craving
            </span>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CRAVINGS.map((item) => {
                const active = vibe.craving === item;
                return (
                  <button
                    key={item}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => onUpdateVibe({ craving: item })}
                    className={`min-h-[42px] rounded-xl border px-4 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-[#D94B6A] bg-[#2B1B22] text-[#F4F1EC]'
                        : 'border-white/10 bg-[#121115] text-[#B6B0BA] hover:bg-[#232028] hover:text-[#F4F1EC]'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/10 pt-6">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#F4F1EC]">
              <Music className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
              Room Soundtrack
            </span>
            <div className="mt-3 flex flex-wrap gap-2">
              {SOUNDTRACKS.map((track) => {
                const active = vibe.soundtrack === track;
                return (
                  <button
                    key={track}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => onUpdateVibe({ soundtrack: track })}
                    className={`min-h-[40px] rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap ${
                      active
                        ? 'border-[#D94B6A] bg-[#2B1B22] text-[#F4F1EC]'
                        : 'border-white/10 bg-[#121115] text-[#B6B0BA] hover:bg-[#232028] hover:text-[#F4F1EC]'
                    }`}
                  >
                    {track}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#19171C] p-6 lg:col-span-5">
          <div>
            <h3 className="text-lg font-semibold text-[#F4F1EC]">Send a Live Nudge</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#A8A2AE]">
              Tap a quick signal to flash a gentle banner on your partner&apos;s screen right now.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2.5">
              {QUICK_NUDGES.map((msg) => (
                <button
                  key={msg}
                  type="button"
                  disabled={!isConnected}
                  onClick={() => onSendNudge(msg)}
                  className="inline-flex min-h-[44px] items-center justify-between rounded-xl border border-white/10 bg-[#121115] px-4 py-2.5 text-sm font-medium text-[#F4F1EC] transition-colors hover:border-[#D94B6A]/50 hover:bg-[#231D24] disabled:opacity-50"
                >
                  <span>{msg}</span>
                  <Send className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="text-xs font-medium text-[#9D97A4]">Current synced summary</p>
            <p className="mt-1.5 text-sm text-[#F4F1EC]">
              {ENERGY_LABELS[vibe.energy]} · {vibe.craving} · {vibe.soundtrack}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
