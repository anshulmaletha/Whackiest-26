# Viora — Say where. Go.

**A voice-first website navigation assistant that understands where you want to go and opens the right website — once.**

Viora simplifies website navigation through natural language and voice interaction. Instead of manually searching for websites or remembering URLs, users simply tell Viora where they want to go.

Say *"Open Amazon"* or *"Open Orion Mall"*, confirm the destination, and Viora takes you there.

**No unnecessary clicks. No automated browsing. Just destination understanding and navigation.**

---

## 🚀 Overview

Viora is an AI-assisted navigation experience built to make accessing websites faster, simpler, and more intuitive.

The system accepts voice or text input, identifies the intended destination, presents a confirmation, and opens the selected website.

Its core principle is simple:

> Understand the destination. Confirm the intent. Open once. Stop.

## ✨ Key Features

- **Voice Interaction:** Navigate using natural spoken commands.
- **Text Input:** Enter destinations manually.
- **Smart Destination Recognition:** Understand destination names and common variations.
- **Quick Suggestions:** Access popular destinations such as Amazon and Orion Mall.
- **Confirmation Before Navigation:** Review the recognized destination before opening it.
- **Visual Navigation Feedback:** Clear feedback during processing and navigation.
- **Error Recovery:** Retry when destination resolution or navigation fails.
- **Controlled Navigation:** Opens the intended website and stops immediately.

## 🧭 How It Works

```text
User Input (Voice / Text)
          |
          v
   Destination Detection
          |
          v
   Intent Resolution
          |
          v
  Destination Confirmation
          |
          v
    Website Navigation
          |
          v
       SUCCESS
          |
          v
         STOP
```

### Example

**User:** "Open Amazon"

1. Viora receives the voice or text command.
2. The destination is identified as Amazon.
3. The user sees a confirmation.
4. Viora opens the Amazon website.
5. Navigation ends.

## 🖥️ Application States

| State | Purpose |
|---|---|
| Initial | Welcome screen |
| Ready | Accept voice or text input |
| Listening | Capture spoken input |
| Processing | Understand the destination |
| Confirmation | Confirm the selected destination |
| Navigating | Open the destination |
| Success | Show successful navigation |
| Error | Display an understandable error |
| Retry | Allow the user to try again |

## 🛠️ Tech Stack

- **Frontend:** Next.js, React, TypeScript
- **Styling:** CSS Modules, Global CSS
- **Backend:** Python, FastAPI
- **Communication:** REST APIs
- **Version Control:** Git and GitHub

*Refer to the project configuration and source code for exact installed versions and dependencies.*

## 📂 Project Structure

```text
Viora/
│
├── app/
│   ├── api/
│   ├── globals.css
│   └── page.tsx
│
├── components/
│   ├── ApplicationShell.tsx
│   ├── VoiceOrb.tsx
│   ├── InitialScreen.tsx
│   ├── ReadyScreen.tsx
│   ├── RouteCard.tsx
│   ├── NavigationProgressTrack.tsx
│   ├── SuccessView.tsx
│   └── ErrorView.tsx
│
├── lib/
├── backend/
├── public/
├── package.json
└── README.md
```

*The structure is illustrative; the repository may contain additional files and directories.*

## ⚙️ Getting Started

### Prerequisites

- Node.js and npm
- Python 3.10+
- Git

### 1. Clone the repository

```bash
git clone https://github.com/anshulmaletha/Whackiest-26.git
cd Whackiest-26
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Start the frontend

```bash
npm run dev
```

Open `http://localhost:3000`.

### 4. Start the backend

Install the backend dependencies:

```bash
pip install fastapi uvicorn
```

Start the backend using the FastAPI entry point configured in the project.

## 🔌 API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check backend health |
| POST | `/api/resolve` | Resolve the user's destination |
| POST | `/api/open` | Open the confirmed destination |

### Resolve Destination

```json
{
  "utterance": "Open Amazon",
  "source": "text"
}
```

### Open Destination

```json
{
  "destinationId": "amazon"
}
```

The actual response structure and supported destination IDs depend on the backend implementation.

## 🔒 Design Philosophy

Viora is built around user control and predictable behavior.

- No autonomous browsing.
- No automatic clicking inside websites.
- No automatic form filling.
- No unnecessary multi-step actions.
- No navigation without destination confirmation.

**Viora opens websites. It never takes control away from the user.**

---

## 🎯 Our Vision

Make navigating the web as simple as saying where you want to go.

**Viora — Say where. Go.**
