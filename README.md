# HuddleAI — AI-Powered Meeting Scribe

HuddleAI is a full-stack web application that turns raw meeting recordings into structured, actionable notes. Teams upload a video or audio file, and the app automatically transcribes it, identifies speakers, generates a plain-English summary, and extracts action items with assignees — all without anyone typing a word.

> **Live demo placeholder** — add a screenshot or GIF here once deployed.

---

## What It Does

| Step | What happens |
|------|-------------|
| **Upload** | Team member drops in a meeting recording (up to 1 GB, any common format) |
| **Process** | Firebase Cloud Functions extract audio, run Google Cloud Speech-to-Text with speaker diarization, then call GPT-4o-mini to generate a summary |
| **Review** | Meeting page shows full transcript, key topics, decisions made, and action items with owners |
| **Notify** | Slack integration posts a formatted summary card to the team channel automatically |
| **Track** | Action items dashboard aggregates open tasks across all team meetings |

The app also supports **Google Calendar/Meet integration** — watch for new meeting recordings and ingest them automatically.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI** | Tailwind CSS v3 + shadcn/ui (Radix UI primitives) |
| **Routing** | React Router v6 |
| **Backend** | Firebase Cloud Functions (Node.js / TypeScript) |
| **Database** | Firestore (NoSQL, real-time) |
| **Auth** | Firebase Authentication (email/password + Google OAuth) |
| **File Storage** | Firebase Storage |
| **Transcription** | Google Cloud Speech-to-Text (speaker diarization) |
| **Summarization** | OpenAI GPT-4o-mini |
| **Notifications** | Slack API (Webhooks + OAuth) |
| **Calendar** | Google Calendar API + Pub/Sub webhooks |

---

## Project Structure

```
huddleai-team-scribe/
├── src/
│   ├── components/       # Shared UI components (Slack, UserProfile, etc.)
│   ├── pages/            # Route-level page components
│   ├── hooks/            # Custom React hooks (useMeetings, useActionItems)
│   ├── lib/              # Firebase client, DB helpers, meeting utilities
│   └── main.tsx          # App entry point
├── functions/
│   └── src/
│       ├── index.ts          # All Cloud Function definitions
│       ├── config.ts         # Function configuration
│       ├── googleIntegration.ts  # Google OAuth + Calendar setup
│       └── calendarWebhook.ts    # Pub/Sub webhook handler
├── firestore.rules       # Firestore security rules
├── storage.rules         # Firebase Storage security rules
├── firebase.json         # Firebase hosting + functions config
└── vite.config.ts
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Firebase project with Firestore, Storage, Auth, and Cloud Functions enabled
- OpenAI API key
- (Optional) Slack app credentials for notification integration

### 1. Clone and install

```bash
git clone <repository-url>
cd huddleai-team-scribe
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root (this file is gitignored — never commit it):

```bash
# Firebase client config — found in Firebase Console → Project Settings → Your Apps
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=1:your-sender-id:web:your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

For Cloud Functions, set secrets via Firebase (not plain env vars):

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
```

### 3. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`.

### 4. (Optional) Run Cloud Functions locally

```bash
cd functions
npm install
npm run serve        # starts Firebase Functions emulator
```

---

## Deploying

```bash
# Build and deploy everything (hosting + functions)
npm run build
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

---

## Key Features in Depth

### Meeting Processing Pipeline

1. User uploads a video/audio file to Firebase Storage
2. A Cloud Function trigger fires on the new file
3. FFmpeg extracts the audio track as 16kHz mono PCM
4. Google Cloud Speech-to-Text transcribes with speaker diarization (up to 10 speakers)
5. GPT-4o-mini receives the transcript and returns structured JSON: summary, key topics, decisions, action items
6. Results are written to Firestore; the frontend polls for status updates

### Team & Workspace Model

Each user can belong to multiple **teams**, each with its own meeting history, members, and settings. The **workspace switcher** lets users toggle between personal and team contexts. Invitations are handled via shareable token links.

### Google Calendar Integration

Connect a Google Workspace account to watch a calendar for new events. When a Google Meet recording is available, the webhook auto-ingests it into the processing pipeline.

---

## Security Notes

- All Firebase client credentials are loaded from environment variables — no keys in source
- OpenAI API key is stored as a Firebase Secret (never in env files or source)
- Firestore security rules enforce per-team data isolation — users cannot read other teams' data
- Storage rules restrict file access to authenticated owners only
- Role-based access: team `owner` vs `member` permissions enforced server-side

---

## Screenshots / Demo

> _Add screenshots here once deployed — suggested captures:_
> - Dashboard (team view with recent meetings)
> - Meeting details page (transcript + summary + action items)
> - Upload flow
> - Slack notification card

---

## Contributing

1. Fork the repo and create a feature branch
2. Run `npm run lint` before submitting a PR
3. Ensure no `.env` files or API keys are included in commits

---

## License

MIT
