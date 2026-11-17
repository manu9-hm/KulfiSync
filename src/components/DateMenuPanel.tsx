import { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Heart,
  Plus,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type { ActivityCategory, DateActivity, Partner, VoteChoice } from '../types/room.ts';

interface DateMenuPanelProps {
  activities: DateActivity[];
  partners: Partner[];
  myPartnerId: string;
  isConnected: boolean;
  onVote: (activityId: string, vote: VoteChoice | null) => void;
  onAddActivity: (payload: {
    title: string;
    category: ActivityCategory;
    duration: string;
    description: string;
  }) => void;
  onToggleComplete: (activityId: string) => void;
  onRemoveActivity: (activityId: string) => void;
}

type FilterOption = 'all' | 'matched' | ActivityCategory;

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  cozy: 'Cozy At-Home',
  culinary: 'Culinary & Dessert',
  out: 'Late-Night Out',
  playful: 'Playful Challenge',
};

const FILTER_TABS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'All Ideas' },
  { key: 'matched', label: 'Matched' },
  { key: 'cozy', label: 'Cozy' },
  { key: 'culinary', label: 'Culinary' },
  { key: 'out', label: 'Out' },
  { key: 'playful', label: 'Playful' },
];

export function DateMenuPanel({
  activities,
  partners,
  myPartnerId,
  isConnected,
  onVote,
  onAddActivity,
  onToggleComplete,
  onRemoveActivity,
}: DateMenuPanelProps) {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('cozy');
  const [duration, setDuration] = useState('45 min');
  const [description, setDescription] = useState('');

  const otherPartner = partners.find((p) => p.id !== myPartnerId) || null;

  const isMutualMatch = (activity: DateActivity): boolean => {
    if (partners.length < 2) return false;
    return partners.every((p) => activity.votes[p.id] === 'yes');
  };

  const matchedCount = useMemo(
    () => activities.filter((a) => isMutualMatch(a)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, partners]
  );

  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    if (filter === 'matched') return activities.filter((a) => isMutualMatch(a));
    return activities.filter((a) => a.category === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, filter, partners]);

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddActivity({
      title: title.trim(),
      category,
      duration: duration.trim() || '45 min',
      description: description.trim(),
    });
    setTitle('');
    setDescription('');
    setDuration('45 min');
    setShowAddForm(false);
    setFilter('all');
  };

  return (
    <section aria-label="Date Menu" className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#F4F1EC]">Tonight&apos;s Date Menu</h2>
          <p className="mt-1 text-sm text-[#A8A2AE]">
            Vote Yes or Pass independently. Any idea you both pick locks in automatically
            <span aria-hidden="true"> · </span>
            <span className="text-[#E5E0E8] tabular-nums">{matchedCount} matched</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          disabled={!isConnected}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#221F26] px-4 py-2 text-sm font-medium text-[#F4F1EC] transition-colors hover:bg-[#2C2831] disabled:opacity-50 whitespace-nowrap"
        >
          {showAddForm ? (
            <>
              <X className="h-4 w-4" aria-hidden="true" />
              Close Form
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 text-[#D94B6A]" aria-hidden="true" />
              Add Custom Idea
            </>
          )}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleSubmitNew}
          className="rounded-2xl border border-white/10 bg-[#19171C] p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-[#F4F1EC]">Suggest a new idea for tonight</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="custom-idea-title" className="block text-xs font-medium text-[#B6B0BA]">
                Activity title
              </label>
              <input
                id="custom-idea-title"
                type="text"
                maxLength={80}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midnight pistachio kulfi walk"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/15 bg-[#121115] px-3.5 text-sm text-[#F4F1EC] placeholder:text-[#6B6470] focus:border-[#D94B6A] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-idea-duration" className="block text-xs font-medium text-[#B6B0BA]">
                Duration
              </label>
              <input
                id="custom-idea-duration"
                type="text"
                maxLength={24}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="45 min"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/15 bg-[#121115] px-3.5 text-sm text-[#F4F1EC] placeholder:text-[#6B6470] focus:border-[#D94B6A] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="custom-idea-category" className="block text-xs font-medium text-[#B6B0BA]">
                Category
              </label>
              <select
                id="custom-idea-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ActivityCategory)}
                className="mt-1.5 h-10 w-full rounded-xl border border-white/15 bg-[#121115] px-3 text-sm text-[#F4F1EC] focus:border-[#D94B6A] focus:outline-none"
              >
                <option value="cozy">Cozy At-Home</option>
                <option value="culinary">Culinary &amp; Dessert</option>
                <option value="out">Late-Night Out</option>
                <option value="playful">Playful Challenge</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="custom-idea-desc" className="block text-xs font-medium text-[#B6B0BA]">
                Short note (optional)
              </label>
              <input
                id="custom-idea-desc"
                type="text"
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pick up two flavors and stroll around the block"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/15 bg-[#121115] px-3.5 text-sm text-[#F4F1EC] placeholder:text-[#6B6470] focus:border-[#D94B6A] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[40px] rounded-xl px-4 py-2 text-sm font-medium text-[#B6B0BA] hover:text-[#F4F1EC] whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !isConnected}
              className="min-h-[40px] rounded-xl bg-[#D94B6A] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-50 whitespace-nowrap"
            >
              Add to Menu
            </button>
          </div>
        </form>
      )}

      <div
        role="tablist"
        aria-label="Filter date ideas"
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#161419] p-1.5"
      >
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab.key)}
              className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-[#2A2630] text-[#F4F1EC]'
                  : 'text-[#A8A2AE] hover:text-[#F4F1EC]'
              }`}
            >
              {tab.label}
              {tab.key === 'matched' && (
                <span className="ml-1.5 font-mono text-[11px] text-[#D94B6A] tabular-nums">
                  {matchedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filteredActivities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#161419] px-6 py-12 text-center">
          <UtensilsCrossed className="mx-auto h-7 w-7 text-[#8E8894]" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-semibold text-[#F4F1EC]">
            {filter === 'matched'
              ? 'No mutual matches yet'
              : 'No activities in this category'}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[#A8A2AE]">
            {filter === 'matched'
              ? partners.length < 2
                ? 'Once your partner joins and you both tap Yes on an idea, it appears here.'
                : 'Tap Yes on ideas you both want to try tonight—mutual picks match instantaneously.'
              : 'Switch back to All Ideas or add your own custom activity for tonight.'}
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-5 inline-flex min-h-[40px] items-center justify-center rounded-xl border border-white/15 bg-[#242129] px-4 py-2 text-sm font-medium text-[#F4F1EC] hover:bg-[#2F2B36] whitespace-nowrap"
          >
            Show All Ideas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredActivities.map((activity) => {
            const myVote = activity.votes[myPartnerId];
            const partnerVote = otherPartner ? activity.votes[otherPartner.id] : undefined;
            const matched = isMutualMatch(activity);

            return (
              <article
                key={activity.id}
                className={`flex flex-col justify-between rounded-2xl border p-6 transition-colors ${
                  matched
                    ? 'border-[#D94B6A]/50 bg-[#1E171D]'
                    : 'border-white/10 bg-[#19171C]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#9D97A4]">
                      <span>{CATEGORY_LABELS[activity.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{activity.duration}</span>
                      {matched && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-[#F08099]">
                            <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                            Matched
                          </span>
                        </>
                      )}
                    </div>

                    {activity.addedByPartnerId && (
                      <button
                        type="button"
                        onClick={() => onRemoveActivity(activity.id)}
                        disabled={!isConnected}
                        aria-label={`Remove ${activity.title}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8E8894] transition-colors hover:bg-white/5 hover:text-[#F48C84] disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <h3
                    className={`mt-2.5 text-lg font-semibold ${
                      activity.completed ? 'text-[#8E8894] line-through' : 'text-[#F4F1EC]'
                    }`}
                  >
                    {activity.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#B6B0BA]">
                    {activity.description}
                  </p>
                </div>

                <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between text-xs text-[#9D97A4]">
                    <span>
                      {otherPartner
                        ? partnerVote === 'yes'
                          ? `${otherPartner.name} voted Yes`
                          : partnerVote === 'no'
                            ? `${otherPartner.name} passed`
                            : `${otherPartner.name} hasn't voted yet`
                        : 'Waiting for partner to vote'}
                    </span>

                    {matched && (
                      <button
                        type="button"
                        onClick={() => onToggleComplete(activity.id)}
                        disabled={!isConnected}
                        className={`inline-flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${
                          activity.completed
                            ? 'text-[#52B788]'
                            : 'text-[#D1CBD6] hover:text-[#F4F1EC]'
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {activity.completed ? 'Done tonight' : 'Mark done'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onVote(activity.id, myVote === 'yes' ? null : 'yes')}
                      disabled={!isConnected}
                      className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap ${
                        myVote === 'yes'
                          ? 'border-[#D94B6A] bg-[#D94B6A] text-white'
                          : 'border-white/15 bg-[#232028] text-[#E5E0E8] hover:bg-[#2D2933]'
                      }`}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => onVote(activity.id, myVote === 'no' ? null : 'no')}
                      disabled={!isConnected}
                      className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap ${
                        myVote === 'no'
                          ? 'border-white/30 bg-[#322E38] text-[#F4F1EC]'
                          : 'border-white/15 bg-[#161419] text-[#A8A2AE] hover:bg-[#232028] hover:text-[#E5E0E8]'
                      }`}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Pass
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
