import { useEffect, useRef, useState } from 'react';
import { MessageSquareHeart, Send } from 'lucide-react';
import type { LoveNote, Partner } from '../types/room.ts';

interface SharedNotesPanelProps {
  notes: LoveNote[];
  partners: Partner[];
  myPartnerId: string;
  isConnected: boolean;
  onAddNote: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
}

function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export function SharedNotesPanel({
  notes,
  partners,
  myPartnerId,
  isConnected,
  onAddNote,
  onTypingChange,
}: SharedNotesPanelProps) {
  const [text, setText] = useState('');
  const typingTimeoutRef = useRef<number | null>(null);

  const typingPartners = partners.filter(
    (p) => p.id !== myPartnerId && p.isTypingNote && p.connected
  );

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (val: string) => {
    setText(val);
    if (!isConnected) return;
    onTypingChange(val.trim().length > 0);

    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !isConnected) return;
    onAddNote(text.trim());
    setText('');
    onTypingChange(false);
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  return (
    <section aria-label="Shared Notes" className="space-y-6">
      <div className="border-b border-white/10 pb-5">
        <h2 className="text-2xl font-semibold text-[#F4F1EC]">Shared Evening Notes</h2>
        <p className="mt-1 text-sm text-[#A8A2AE]">
          Drop links, addresses, sweet reminders, or the grocery run list for tonight.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/10 bg-[#19171C] p-5"
      >
        <label htmlFor="shared-note-input" className="sr-only">
          Write a shared note
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="shared-note-input"
            type="text"
            maxLength={320}
            value={text}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={!isConnected}
            placeholder="Leave a quick note for tonight..."
            className="h-11 flex-1 rounded-xl border border-white/15 bg-[#121115] px-4 text-sm text-[#F4F1EC] placeholder:text-[#6B6470] focus:border-[#D94B6A] focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!isConnected || !text.trim()}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C63D5B] disabled:opacity-50 whitespace-nowrap"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Send Note
          </button>
        </div>
        {typingPartners.length > 0 && (
          <p className="mt-2.5 text-xs text-[#F08099]">
            {typingPartners.map((p) => p.name).join(', ')} is writing a note...
          </p>
        )}
      </form>

      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#161419] px-6 py-12 text-center">
          <MessageSquareHeart className="mx-auto h-7 w-7 text-[#8E8894]" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-semibold text-[#F4F1EC]">No shared notes yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[#A8A2AE]">
            Write the first note above—your partner will see it appear here instantaneously.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const isMine = note.authorId === myPartnerId;
            return (
              <li
                key={note.id}
                className={`rounded-2xl border p-5 ${
                  isMine
                    ? 'border-[#D94B6A]/35 bg-[#1D171C]'
                    : 'border-white/10 bg-[#19171C]'
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-[#9D97A4]">
                  <span className="font-semibold text-[#F4F1EC]">
                    {isMine ? `${note.authorName} (You)` : note.authorName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatTime(note.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#E5E0E8]">{note.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
