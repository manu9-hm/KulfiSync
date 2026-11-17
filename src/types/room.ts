export type ActivityCategory = 'cozy' | 'culinary' | 'out' | 'playful';

export type VoteChoice = 'yes' | 'no';

export interface Partner {
  id: string;
  name: string;
  connected: boolean;
  isTypingNote: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface DateActivity {
  id: string;
  title: string;
  category: ActivityCategory;
  duration: string;
  description: string;
  addedByPartnerId?: string;
  votes: Record<string, VoteChoice>;
  completed: boolean;
}

export interface QuestionCard {
  id: string;
  prompt: string;
  category: 'warm' | 'playful' | 'deep';
}

export interface QuestionRoundState {
  cardIndex: number;
  submittedIds: string[];
  answers: Record<string, string>;
  revealed: boolean;
}

export interface VibeState {
  energy: number;
  craving: string;
  soundtrack: string;
  updatedByName?: string;
  updatedAt: number;
}

export interface LoveNote {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

export interface NudgeEvent {
  fromId: string;
  fromName: string;
  message: string;
  at: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasStroke {
  id: string;
  authorId: string;
  authorName: string;
  color: string;
  size: number;
  points: CanvasPoint[];
  createdAt: number;
}

export type CoupleGameMode = 'know_me' | 'would_you_rather';

export interface CoupleGameQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface CoupleGameRound {
  id: string;
  mode: CoupleGameMode;
  moodTag: string;
  generatedAt: number;
  generatedByName: string;
  questions: CoupleGameQuestion[];
  currentIndex: number;
  submittedByQuestion: Record<string, string[]>;
  answers: Record<string, Record<string, number>>;
  revealedQuestions: Record<string, boolean>;
}

export interface RoomState {
  code: string;
  createdAt: number;
  partners: Partner[];
  activities: DateActivity[];
  deck: QuestionCard[];
  questionRound: QuestionRoundState;
  vibe: VibeState;
  notes: LoveNote[];
  lastNudge?: NudgeEvent;
  canvasStrokes: CanvasStroke[];
  coupleGame: CoupleGameRound | null;
  coupleGameGenerating: boolean;
}

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_CODE'
  | 'INVALID_PAYLOAD';

export type ClientMessage =
  | { type: 'room:join'; code: string; partnerId: string; name: string }
  | { type: 'room:leave' }
  | { type: 'partner:rename'; name: string }
  | { type: 'activity:vote'; activityId: string; vote: VoteChoice | null }
  | {
      type: 'activity:add';
      id: string;
      title: string;
      category: ActivityCategory;
      duration: string;
      description: string;
    }
  | { type: 'activity:toggle_complete'; activityId: string }
  | { type: 'activity:remove'; activityId: string }
  | { type: 'deck:next' }
  | { type: 'deck:prev' }
  | { type: 'deck:shuffle' }
  | { type: 'deck:answer'; text: string }
  | { type: 'deck:reveal' }
  | {
      type: 'vibe:update';
      energy?: number;
      craving?: string;
      soundtrack?: string;
    }
  | { type: 'nudge:send'; message: string }
  | { type: 'note:add'; id: string; text: string }
  | { type: 'note:typing'; isTyping: boolean }
  | { type: 'canvas:stroke_live'; stroke: CanvasStroke }
  | { type: 'canvas:stroke_commit'; stroke: CanvasStroke }
  | { type: 'canvas:undo' }
  | { type: 'canvas:clear' }
  | {
      type: 'canvas:load_snapshot';
      strokes: { color: string; size: number; points: CanvasPoint[] }[];
    }
  | { type: 'game:answer'; questionId: string; optionIndex: number }
  | { type: 'game:next' }
  | { type: 'game:prev' }
  | { type: 'game:jump'; index: number }
  | { type: 'game:reveal'; questionId: string }
  | { type: 'game:reset' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'room:joined'; partnerId: string; state: RoomState }
  | { type: 'room:state'; state: RoomState }
  | { type: 'room:error'; errorCode: RoomErrorCode; message: string }
  | { type: 'match:celebrate'; activityId: string; title: string }
  | { type: 'nudge:received'; nudge: NudgeEvent }
  | { type: 'canvas:live_stroke'; stroke: CanvasStroke }
  | { type: 'pong' };
