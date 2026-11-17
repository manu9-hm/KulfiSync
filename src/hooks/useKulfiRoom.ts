import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../firebase.ts';
import { getArchivedRoomForRejoin } from '../services/memoriesService.ts';
import type {
  ActivityCategory,
  CanvasPoint,
  CanvasStroke,
  ClientMessage,
  CoupleGameMode,
  NudgeEvent,
  RoomErrorCode,
  RoomState,
  ServerMessage,
  VoteChoice,
} from '../types/room.ts';

export type ConnectionStatus =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface MatchBanner {
  activityId: string;
  title: string;
  at: number;
}

const PARTNER_ID_KEY = 'kulfisync_partner_id';
const PARTNER_NAME_KEY = 'kulfisync_partner_name';
const LAST_ROOM_KEY = 'kulfisync_last_room';

function getOrCreatePartnerId(): string {
  const existing = sessionStorage.getItem(PARTNER_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
  sessionStorage.setItem(PARTNER_ID_KEY, generated);
  return generated;
}

function getInitialName(): string {
  return sessionStorage.getItem(PARTNER_NAME_KEY) || '';
}

function getInitialRoomCodeFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('room')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
  if (fromUrl.length === 6) return fromUrl;
  return sessionStorage.getItem(LAST_ROOM_KEY) || '';
}

function syncRoomCodeToUrl(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set('room', code);
    sessionStorage.setItem(LAST_ROOM_KEY, code);
  } else {
    url.searchParams.delete('room');
    sessionStorage.removeItem(LAST_ROOM_KEY);
  }
  window.history.replaceState({}, '', url.toString());
}

export function useKulfiRoom() {
  const partnerIdRef = useRef<string>(getOrCreatePartnerId());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const intentionalCloseRef = useRef<boolean>(false);
  const activeTargetRef = useRef<{ code: string; name: string } | null>(null);

  const [partnerName, setPartnerName] = useState<string>(getInitialName);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<RoomErrorCode | 'NETWORK' | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [pendingCode, setPendingCode] = useState<string>(getInitialRoomCodeFromUrl);
  const [matchBanner, setMatchBanner] = useState<MatchBanner | null>(null);
  const [nudgeBanner, setNudgeBanner] = useState<NudgeEvent | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [partnerLiveStroke, setPartnerLiveStroke] = useState<CanvasStroke | null>(null);
  const liveStrokeTimerRef = useRef<number | null>(null);
  const [isGeneratingGame, setIsGeneratingGame] = useState<boolean>(false);
  const [gameGenerateError, setGameGenerateError] = useState<string | null>(null);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const closeSocketCleanly = useCallback(() => {
    clearTimers();
    const ws = wsRef.current;
    if (ws) {
      intentionalCloseRef.current = true;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    }
  }, [clearTimers]);

  const sendMessage = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const openWebSocket = useCallback(
    (code: string, displayName: string, isRetry: boolean) => {
      closeSocketCleanly();
      intentionalCloseRef.current = false;
      activeTargetRef.current = { code, name: displayName };

      setStatus(isRetry ? 'reconnecting' : 'joining');
      setErrorMessage(null);
      setErrorCode(null);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        ws.send(
          JSON.stringify({
            type: 'room:join',
            code,
            partnerId: partnerIdRef.current,
            name: displayName,
          } satisfies ClientMessage)
        );

        heartbeatTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          if (msg.type === 'pong') return;

          if (msg.type === 'room:joined') {
            setRoom(msg.state);
            setStatus('connected');
            setErrorMessage(null);
            setErrorCode(null);
            syncRoomCodeToUrl(msg.state.code);
            return;
          }

          if (msg.type === 'room:state') {
            setRoom(msg.state);
            setStatus('connected');
            setPartnerLiveStroke((prev) =>
              prev && msg.state.canvasStrokes.some((s) => s.id === prev.id)
                ? null
                : prev
            );
            return;
          }

          if (msg.type === 'room:error') {
            setErrorMessage(msg.message);
            setErrorCode(msg.errorCode);
            setStatus('error');
            activeTargetRef.current = null;
            if (msg.errorCode === 'ROOM_NOT_FOUND') {
              syncRoomCodeToUrl(null);
            }
            closeSocketCleanly();
            return;
          }

          if (msg.type === 'match:celebrate') {
            setMatchBanner({
              activityId: msg.activityId,
              title: msg.title,
              at: Date.now(),
            });
            return;
          }

          if (msg.type === 'nudge:received') {
            setNudgeBanner(msg.nudge);
            return;
          }

          if (msg.type === 'canvas:live_stroke') {
            setPartnerLiveStroke(msg.stroke);
            if (liveStrokeTimerRef.current !== null) {
              window.clearTimeout(liveStrokeTimerRef.current);
            }
            liveStrokeTimerRef.current = window.setTimeout(() => {
              setPartnerLiveStroke(null);
            }, 2500);
            return;
          }
        } catch {
          // Ignore malformed server payload
        }
      };

      ws.onerror = () => {
        // Let onclose handle transitions cleanly
      };

      ws.onclose = () => {
        clearTimers();
        wsRef.current = null;

        if (intentionalCloseRef.current) {
          return;
        }

        const target = activeTargetRef.current;
        if (!target) {
          setStatus('disconnected');
          setErrorMessage('Connection closed. Please retry.');
          return;
        }

        const nextAttempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = nextAttempt;
        setReconnectAttempt(nextAttempt);

        if (nextAttempt <= 4) {
          setStatus('reconnecting');
          const delayMs = Math.min(1000 * Math.pow(1.6, nextAttempt - 1), 6000);
          reconnectTimerRef.current = window.setTimeout(() => {
            openWebSocket(target.code, target.name, true);
          }, delayMs);
        } else {
          setStatus('disconnected');
          setErrorMessage('Lost connection to the room server. Retry to resync.');
          setErrorCode('NETWORK');
        }
      };
    },
    [clearTimers, closeSocketCleanly]
  );

  const createRoom = useCallback(
    async (rawName: string) => {
      const cleanName = rawName.trim() || 'Partner 1';
      sessionStorage.setItem(PARTNER_NAME_KEY, cleanName);
      setPartnerName(cleanName);
      setStatus('creating');
      setErrorMessage(null);
      setErrorCode(null);

      try {
        const response = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error('Server could not create a room.');
        }
        const data = (await response.json()) as { code: string };
        setPendingCode(data.code);
        openWebSocket(data.code, cleanName, false);
      } catch {
        setStatus('error');
        setErrorCode('NETWORK');
        setErrorMessage('Could not reach the KulfiSync server to create a room.');
      }
    },
    [openWebSocket]
  );

  const joinRoom = useCallback(
    async (rawCode: string, rawName: string) => {
      const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cleanName = rawName.trim() || 'Partner 2';

      if (code.length !== 6) {
        setStatus('error');
        setErrorCode('INVALID_CODE');
        setErrorMessage('Please enter a valid 6-character invite code.');
        return;
      }

      sessionStorage.setItem(PARTNER_NAME_KEY, cleanName);
      setPartnerName(cleanName);
      setPendingCode(code);
      setStatus('joining');
      setErrorMessage(null);
      setErrorCode(null);

      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(code)}?partnerId=${encodeURIComponent(
            partnerIdRef.current
          )}`
        );
        const info = (await res.json()) as {
          exists: boolean;
          isFull: boolean;
          error?: string;
        };

        if (!res.ok || !info.exists) {
          if (res.status === 404 && auth.currentUser) {
            const archived = await getArchivedRoomForRejoin(code);
            if (archived) {
              const restoreRes = await fetch('/api/rooms/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code,
                  lastVibe: {
                    energy: archived.lastEnergy,
                    craving: archived.lastCraving,
                    soundtrack: archived.lastSoundtrack,
                  },
                }),
              });
              if (restoreRes.ok) {
                openWebSocket(code, cleanName, false);
                return;
              }
            }
          }

          setStatus('error');
          setErrorCode('ROOM_NOT_FOUND');
          setErrorMessage(
            info.error || `Room ${code} was not found. Check the code or create a new one.`
          );
          return;
        }

        if (info.isFull) {
          setStatus('error');
          setErrorCode('ROOM_FULL');
          setErrorMessage(`Room ${code} already has 2 partners connected.`);
          return;
        }

        openWebSocket(code, cleanName, false);
      } catch {
        setStatus('error');
        setErrorCode('NETWORK');
        setErrorMessage('Unable to verify the room right now. Check your connection and retry.');
      }
    },
    [openWebSocket]
  );

  const retryConnection = useCallback(() => {
    const target = activeTargetRef.current;
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);

    if (target) {
      openWebSocket(target.code, target.name, false);
      return;
    }

    if (pendingCode.length === 6) {
      void joinRoom(pendingCode, partnerName);
    } else {
      void createRoom(partnerName);
    }
  }, [createRoom, joinRoom, openWebSocket, partnerName, pendingCode]);

  const leaveRoom = useCallback(() => {
    sendMessage({ type: 'room:leave' });
    activeTargetRef.current = null;
    closeSocketCleanly();
    syncRoomCodeToUrl(null);
    setRoom(null);
    setStatus('idle');
    setErrorMessage(null);
    setErrorCode(null);
    setPendingCode('');
    setMatchBanner(null);
    setNudgeBanner(null);
    setPartnerLiveStroke(null);
    setGameGenerateError(null);
  }, [closeSocketCleanly, sendMessage]);

  const resetError = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
    setErrorCode(null);
  }, []);

  // Reconnect automatically if returning to an active session in the same tab
  useEffect(() => {
    const lastRoom = sessionStorage.getItem(LAST_ROOM_KEY);
    const savedName = sessionStorage.getItem(PARTNER_NAME_KEY);
    if (lastRoom && lastRoom.length === 6 && savedName) {
      void joinRoom(lastRoom, savedName);
    }
    return () => {
      closeSocketCleanly();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to browser online/offline events for immediate disconnect feedback
  useEffect(() => {
    const handleOffline = () => {
      if (activeTargetRef.current) {
        setStatus('disconnected');
        setErrorMessage('Your device appears offline. Reconnect when ready.');
        setErrorCode('NETWORK');
      }
    };
    const handleOnline = () => {
      if (activeTargetRef.current && wsRef.current?.readyState !== WebSocket.OPEN) {
        retryConnection();
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [retryConnection]);

  // Dismiss banners automatically
  useEffect(() => {
    if (!matchBanner) return;
    const timer = window.setTimeout(() => setMatchBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [matchBanner]);

  useEffect(() => {
    if (!nudgeBanner) return;
    const timer = window.setTimeout(() => setNudgeBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [nudgeBanner]);

  const voteActivity = useCallback(
    (activityId: string, vote: VoteChoice | null) => {
      sendMessage({ type: 'activity:vote', activityId, vote });
    },
    [sendMessage]
  );

  const addActivity = useCallback(
    (payload: {
      title: string;
      category: ActivityCategory;
      duration: string;
      description: string;
    }) => {
      const id = `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return sendMessage({ type: 'activity:add', id, ...payload });
    },
    [sendMessage]
  );

  const toggleActivityComplete = useCallback(
    (activityId: string) => {
      sendMessage({ type: 'activity:toggle_complete', activityId });
    },
    [sendMessage]
  );

  const removeActivity = useCallback(
    (activityId: string) => {
      sendMessage({ type: 'activity:remove', activityId });
    },
    [sendMessage]
  );

  const nextCard = useCallback(() => sendMessage({ type: 'deck:next' }), [sendMessage]);
  const prevCard = useCallback(() => sendMessage({ type: 'deck:prev' }), [sendMessage]);
  const shuffleDeck = useCallback(() => sendMessage({ type: 'deck:shuffle' }), [sendMessage]);
  const submitAnswer = useCallback(
    (text: string) => sendMessage({ type: 'deck:answer', text }),
    [sendMessage]
  );
  const revealAnswers = useCallback(() => sendMessage({ type: 'deck:reveal' }), [sendMessage]);

  const updateVibe = useCallback(
    (patch: { energy?: number; craving?: string; soundtrack?: string }) => {
      sendMessage({ type: 'vibe:update', ...patch });
    },
    [sendMessage]
  );

  const sendNudge = useCallback(
    (message: string) => sendMessage({ type: 'nudge:send', message }),
    [sendMessage]
  );

  const addNote = useCallback(
    (text: string) => {
      const id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      return sendMessage({ type: 'note:add', id, text });
    },
    [sendMessage]
  );

  const setTypingNote = useCallback(
    (isTyping: boolean) => {
      sendMessage({ type: 'note:typing', isTyping });
    },
    [sendMessage]
  );

  const sendLiveStroke = useCallback(
    (stroke: CanvasStroke) => {
      sendMessage({ type: 'canvas:stroke_live', stroke });
    },
    [sendMessage]
  );

  const commitStroke = useCallback(
    (stroke: CanvasStroke) => {
      sendMessage({ type: 'canvas:stroke_commit', stroke });
    },
    [sendMessage]
  );

  const undoCanvas = useCallback(() => {
    sendMessage({ type: 'canvas:undo' });
  }, [sendMessage]);

  const clearCanvas = useCallback(() => {
    setPartnerLiveStroke(null);
    sendMessage({ type: 'canvas:clear' });
  }, [sendMessage]);

  const generateCoupleGame = useCallback(
    async (mode: CoupleGameMode, moodTag: string) => {
      if (!room) return;
      setIsGeneratingGame(true);
      setGameGenerateError(null);
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.code)}/couple-game/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode,
              moodTag,
              partnerId: partnerIdRef.current,
            }),
          }
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Could not generate couple game deck.');
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Unable to generate couple game deck.';
        setGameGenerateError(msg);
      } finally {
        setIsGeneratingGame(false);
      }
    },
    [room]
  );

  const answerCoupleGame = useCallback(
    (questionId: string, optionIndex: number) => {
      sendMessage({ type: 'game:answer', questionId, optionIndex });
    },
    [sendMessage]
  );

  const nextCoupleGameCard = useCallback(
    () => sendMessage({ type: 'game:next' }),
    [sendMessage]
  );

  const prevCoupleGameCard = useCallback(
    () => sendMessage({ type: 'game:prev' }),
    [sendMessage]
  );

  const jumpCoupleGameCard = useCallback(
    (index: number) => sendMessage({ type: 'game:jump', index }),
    [sendMessage]
  );

  const revealCoupleGameCard = useCallback(
    (questionId: string) => sendMessage({ type: 'game:reveal', questionId }),
    [sendMessage]
  );

  const resetCoupleGame = useCallback(
    () => sendMessage({ type: 'game:reset' }),
    [sendMessage]
  );

  const loadSnapshotStrokes = useCallback(
    (strokes: { color: string; size: number; points: CanvasPoint[] }[]) => {
      sendMessage({ type: 'canvas:load_snapshot', strokes });
    },
    [sendMessage]
  );

  return {
    myPartnerId: partnerIdRef.current,
    partnerName,
    setPartnerName,
    pendingCode,
    setPendingCode,
    status,
    errorMessage,
    errorCode,
    reconnectAttempt,
    room,
    partnerLiveStroke,
    isGeneratingGame,
    gameGenerateError,
    clearGameGenerateError: () => setGameGenerateError(null),
    matchBanner,
    dismissMatchBanner: () => setMatchBanner(null),
    nudgeBanner,
    dismissNudgeBanner: () => setNudgeBanner(null),
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
  };
}
