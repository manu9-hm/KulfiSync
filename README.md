# KulfiSync

**KulfiSync** is a full-stack, real-time date-night web application for two partners, built with **React + TypeScript + Tailwind CSS**, a **Node.js (Express + `ws` WebSocket)** server, **Google Gemini (`@google/genai`)**, and **Firebase Authentication + Cloud Firestore**.

Two partners open a private 6-character room, collaborate live on a shared date-night menu, simultaneous-reveal conversation cards, shared drawing canvas, AI-generated daily couple games, mood/vibe sync, and shared notes—while optionally signing in with Google to archive rooms, canvas snapshots, and game history in Firestore.

---

## Key Features

- **Private 2-Partner Rooms**: Generate unambiguous 6-character invite codes (`CODE_ALPHABET` excludes `0`, `1`, `I`, `O`) or join via code/invite link (`/?room=XXXXXX`).
- **Date Menu**: Independently vote `Yes` / `No` on curated or custom evening activities; mutual `Yes` picks trigger synchronized `match:celebrate` notifications.
- **Question Deck (Simultaneous Reveal)**: Both partners answer the active prompt card independently; answers remain hidden on the server until both submit or reveal early.
- **Shared Drawing Canvas**: Live pointer/touch stroke preview (`canvas:stroke_live`), server-committed stroke list (`canvas:stroke_commit`), per-author undo (`canvas:undo`), clear, PNG export, and Firestore vector snapshot saving/loading.
- **AI Daily Couple Game**: Server-side Gemini (`gemini-4-hydrogen`) structured JSON endpoint generates a tailored 5-card **"How Well Do You Know Me?"** (4 options/card) or **"Would You Rather"** (2 options/card) deck from a chosen mood tag, tracking hidden picks and revealing matches.
- **Mood, Vibe & Notes**: Sync energy level, dessert craving, soundtrack, instant nudges, typing indicators, and evening notes.
- **Persistent Room Memories (Firebase)**: Google Sign-In archives room metadata (`/rooms/{roomCode}`), saved vector canvas snapshots (`/rooms/{roomCode}/snapshots/{snapshotId}`), and completed couple game scores (`/rooms/{roomCode}/gameHistory/{gameId}`) so couples can rejoin past rooms and load memories back onto the live canvas.

---

## System Architecture

```text
+-------------------------------------------------------------------+
|                        Browser SPA (React 19)                     |
|  - RoomConnectionScreen & Past Rooms Archive                      |
|  - DateMenuPanel / QuestionDeckPanel / VibeSyncPanel / Notes      |
|  - SharedCanvasPanel (Pointer Events + HiDPI 2D Canvas)           |
|  - CoupleGamePanel & MemoriesPanel                                |
+-----------+-----------------------------------+-------------------+
            | REST + WebSocket (/ws)            | Firebase SDK
            v                                   v
+----------------------------------+  +-----------------------------+
|  Node.js Server (Port 3000)      |  |  Firebase Cloud Platform    |
|  - Express REST Endpoints        |  |  - Firebase Auth (Google)   |
|    * POST /api/rooms             |  |  - Cloud Firestore          |
|    * GET  /api/rooms/:code       |  |    /rooms/{code}            |
|    * POST /api/rooms/restore     |  |      /members/{uid}         |
|    * POST /api/rooms/:code/      |  |      /snapshots/{id}        |
|           couple-game/generate   |  |      /gameHistory/{id}      |
|  - Authoritative WS Room Engine  |  +-----------------------------+
|  - @google/genai (gemini-4-      |
|    hydrogen structured JSON)     |
+----------------------------------+
```

### Module Breakdown
| Path | Responsibility |
| :--- | :--- |
| `server.ts` | Server entrypoint binding Vite dev middleware (dev) or `dist/` static assets (prod) to port `3000`. |
| `src/server/createKulfiServer.ts` | Isolated Express + `ws` server factory with dependency injection hooks for integration testing. |
| `src/server/roomLogic.ts` | Pure room code generation, privacy-aware state projection (`sanitizeRoomForPartner`), stale eviction, and Gemini JSON schema validation (`validateAndNormalizeGeminiDeck`). |
| `src/hooks/useKulfiRoom.ts` | WebSocket lifecycle, heartbeat ping, exponential-backoff reconnect, and archived room rehydration. |
| `src/hooks/useFirebaseMemories.ts` | Firebase Auth state, automatic room archive sync, real-time Firestore snapshot/game subscriptions. |
| `src/services/memoriesService.ts` | Batched Firestore writes (`ensureRoomArchive`, `saveCanvasSnapshotToFirestore`, `saveGameHistoryToFirestore`), compact stroke serialization, and backfill sync. |
| `firestore.rules` | Eight-Pillar security rules validating room codes, participant membership (`participantUids` max 2), `request.time` timestamps, and strict field allowlists. |

---

## Real-Time Sync Design & Trade-Offs

1. **Server-Authoritative Full-State Broadcasts vs. Client CRDTs / Operational Transform**
   - *Design*: All room mutations (`activity:vote`, `deck:answer`, `canvas:stroke_commit`, `game:answer`) pass through the Node.js server, which updates canonical `ServerRoom` state and broadcasts `room:state` to both sockets.
   - *Trade-Off*: Because each room has at most 2 partners and compact state (< 100 KB), broadcasting canonical snapshots completely eliminates state divergence, merge conflicts, and clock skew at the cost of slightly higher per-event payload size than delta patching.
2. **Privacy-Preserving Server Projection**
   - *Design*: Answers in `QuestionDeck` and `CoupleGame` are stored on the server immediately, but `sanitizeRoomForPartner(room, viewerId)` strips the partner's answer values until both partners submit (or someone triggers an early reveal), exposing only `submittedIds` / `submittedByQuestion`.
   - *Trade-Off*: Prevents partners from inspecting WebSocket frames or browser DevTools to peek at each other's answers early.
3. **Ephemeral Live Canvas Strokes vs. Committed Vector History**
   - *Design*: In-flight pointer drags emit throttled (~35 ms) `canvas:stroke_live` frames relayed directly to the other partner without mutating room history. Lifting the pointer commits the finished stroke via `canvas:stroke_commit` (capped at 400 strokes) and broadcasts `room:state`.
   - *Trade-Off*: Achieves smooth 30 fps live ink preview while avoiding 60 Hz full-room serialization churn during drawing.
4. **Compact Vector Canvas Snapshots in Firestore**
   - *Design*: Instead of storing multi-megabyte base64 PNGs inside Firestore documents, `memoriesService.ts` downsamples up to 200 strokes (<= 64 points each) as native Firestore arrays of normalized `[0..1]` coordinates (`SavedCanvasSnapshot`).
   - *Trade-Off*: Thumbnails render crisply at any aspect ratio, stay well below Firestore's 1 MiB document cap, and can be reloaded directly onto the live collaborative canvas (`canvas:load_snapshot`).
5. **Query Indexing Trade-Off**
   - *Design*: Queries on `rooms`, `snapshots`, and `gameHistory` filter by `where('participantUids', 'array-contains', uid)` without a Firestore `.orderBy()`, sorting chronologically in client memory.
   - *Trade-Off*: Avoids composite index deployment failures for small per-couple archives (`<= 1000` items), assuming room archive sizes stay modest.

---

## Edge Cases Handled

- **Dual-Socket Reconnection Race Condition**: If Partner 1 reloads or opens a replacement WebSocket (`ws_new`) with the same `partnerId` before the old socket (`ws_old`) finishes closing, `ws_old.on('close')` checks `room.sockets.get(partnerId) === ws_old` before marking the partner offline or deleting the socket entry.
- **2-Partner Cap & Stale Partner Eviction**: `evictStaleDisconnectedPartner` allows a disconnected partner 10 minutes (`STALE_PARTNER_MS`) to reconnect cleanly via `sessionStorage` `kulfisync_partner_id`. Once expired, a new partner can claim the open slot instead of permanently deadlocking the room.
- **Idempotent Message Handling**: Client-generated IDs (`activity:add`, `note:add`, `canvas:stroke_commit`) are deduplicated server-side so reconnect retries never duplicate notes, activities, or canvas strokes.
- **Client Exponential Backoff & Offline Detection**: `useKulfiRoom` sends 15 s heartbeats, listens to browser `online`/`offline` events, retries WebSocket connection up to 4 times with capped exponential backoff (`1s` to `6s`), and surfaces explicit retry controls when disconnected.
- **Expired In-Memory Room Rehydration**: In-memory live rooms expire after 30 minutes of zero active sockets (`ROOM_IDLE_TTL_MS`). When a signed-in user rejoins an archived room code from Firestore (or via `?room=CODE`), `useKulfiRoom` detects the `404`, fetches archived vibe metadata from Firestore, and calls `POST /api/rooms/restore` before opening the WebSocket.
- **Gemini Transient Errors & Schema Guardrails**: `POST /api/rooms/:code/couple-game/generate` retries transient `503`/`429` errors up to 3 times with backoff, validates exact card count (`5`) and mode option count (`4` for `know_me`, `2` for `would_you_rather`) via `validateAndNormalizeGeminiDeck`, and always resets `coupleGameGenerating = false` in `catch` so the UI never freezes in a loading state.
- **Firestore Partner Access Backfill**: When Partner 2 signs in and joins an existing room archive created by Partner 1, `backfillParticipantAccess` propagates both UIDs onto prior `snapshots` and `gameHistory` documents so both partners can list all room memories under `firestore.rules`.

---

## Local Setup & Testing

### 1. Prerequisites
- **Node.js** `>= 22.x`
- **npm** `>= 10.x`
- A **Gemini API Key** (for AI Daily Couple Game generation)
- Optional: A Firebase project with **Google Auth** and **Cloud Firestore** configured in `firebase-applet-config.json` (already provisioned in AI Studio).

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your secrets:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY="your_gemini_api_key_here"
APP_URL="http://localhost:3000"
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Locally (Dev Mode)

```bash
npm run dev
```

Open `http://localhost:3000` in two browser tabs (each tab keeps an isolated `sessionStorage` `partnerId` so you can test two-partner sync on one machine).

### 5. Build & Run Production

```bash
npm run build
NODE_ENV=production npm start
```

### 6. Run Tests, Type-Check & Security Rules Lint

```bash
# Run unit & WebSocket/HTTP integration tests
npm test

# Type-check TypeScript across frontend & server
npm run lint

# Validate Firestore security rules
npx eslint firestore.rules
```
