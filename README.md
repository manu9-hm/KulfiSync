# KulfiSync

KulfiSync is a full-stack, dark-mode real-time experience web application built for couples to connect and play together asynchronously or live during evening hours.

## Key Features

- **Instant Room Pairing:** Generate or join private 6-character invite rooms with live connection indicators and automatic reconnection handling.
- **Synchronized Drawing Canvas:** Real-time stroke, color, and canvas state synchronization across connected partners.
- **AI Daily Couple Game:** Dynamically generates 5-question mood-tuned decks (*"How Well Do You Know Me?"*, *"Would You Rather"*) via the Gemini API with structured JSON validation and timeout fallback handling.
- **Date Menu & Shared Notes:** Collaborative date-idea voting with automatic match lock-in and shared evening notes.
- **Persistent Memories:** Saves completed game scores, room metadata, and canvas snapshots in Firebase Firestore so couples can revisit past sessions.

## Tech Stack

- **Frontend:** React, Tailwind CSS
- **Backend:** Node.js, WebSockets / Real-Time State Sync
- **AI Integration:** Google Gemini API (`gemini-2.5-flash` with structured JSON output)
- **Database & Auth:** Firebase Firestore, Firebase Authentication

## Architecture & Trade-offs

- **Real-Time State Synchronization:** Uses lightweight server-side room state broadcasting over WebSockets/real-time listeners to keep drawing strokes and game turns synced under 200ms while gracefully handling network drops and client reconnections.
- **Resilient AI Game Engine:** Enforces strict JSON schema validation on Gemini API responses and includes an automatic fallback deck mechanism so rate limits or network latency never trap users in infinite loading states.
- **Evening-First UX:** Built with a low-glare dark-mode palette and explicit loading, empty, disconnected, and retry UI states tailored for mobile and web night-time usage.

## Local Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/KulfiSync.git
   cd KulfiSync
