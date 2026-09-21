# SillyTavern DB/Memory Extension

Database-backed memory extension for SillyTavern with PostgreSQL + pgvector backend.

## Features

- **Persistent Memory** — All memories stored in PostgreSQL with pgvector embeddings
- **Semantic Search** — Find relevant memories by similarity
- **Auto-Sync** — Automatically sync chat messages to backend
- **Auto-Extract** — AI-powered memory extraction from messages
- **Context Building** — Inject relevant memories into chat context
- **Dark Theme** — Matches SillyTavern UI

## Requirements

- SillyTavern 1.10.0+
- Backend API running (see [sillytavern-memory-backend](https://github.com/yourusername/sillytavern-memory-backend))
- PostgreSQL 16+ with pgvector extension

## Installation

### From Git URL (Recommended)

1. Open SillyTavern → Extensions panel (puzzle icon)
2. Click **Install Extension**
3. Paste this repository URL: `https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git`
4. Click **Install**
5. Refresh the page

### Manual Installation

1. Download/clone this repository
2. Copy the folder to `SillyTavern/public/scripts/extensions/sillytavern-db-memory-extension/`
3. Refresh SillyTavern
4. Enable the extension in Extensions panel

## Mobile Support

✅ **Android** — Works in SillyTavern PWA (Chrome/Firefox)
✅ **iOS** — Works in SillyTavern PWA (Safari)
✅ **Termux** — Works with local backend

## Configuration

### Connection Tab

| Field | Description |
|-------|-------------|
| Backend URL | Your backend API URL (e.g., `http://localhost:3000`) |
| Username | Backend account username |
| Password | Backend account password |
| Connect | Authenticate and save credentials |
| Test Connection | Verify backend is reachable |

### Memory Tab

- **Search** — Filter memories by text
- **Type Filter** — Filter by memory type (fact, event, preference, relationship)
- **Importance Filter** — Filter by importance level
- **Sort** — Sort by relevance, date, or importance
- **Delete** — Remove memories from database

### Context Tab

Shows active memories for current chat:
- Memory count
- Average relevance score
- Last updated timestamp
- List of relevant memories with scores

### Settings Tab

| Setting | Default | Description |
|---------|---------|-------------|
| Auto Sync | ✓ | Sync messages automatically |
| Auto Extract | ✓ | Extract memories from messages |
| Messages per Sync | 10 | Batch size for sync |
| Memories per Context | 5 | Max memories in context |
| Similarity Threshold | 0.7 | Minimum relevance score (0.0-1.0) |
| Show Relevance Scores | ✓ | Display score percentages |
| Debug Mode | ✗ | Enable console logging |

## API Endpoints

This extension communicates with the backend via:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/auth/login` | POST | JWT authentication |
| `/api/messages` | POST | Create message |
| `/api/memories` | GET | List memories |
| `/api/memories/process` | POST | Extract memories from message |
| `/api/context` | POST | Build context for chat |

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌─────────────────┐
│ SillyTavern  │────▶│   Extension │────▶│  Backend API    │
│   (Client)   │     │   (JWT)     │     │ (Node.js + TS)  │
└──────────────┘     └─────────────┘     └────────┬────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
                                         │  PostgreSQL 16  │
                                         │  + pgvector     │
                                         └─────────────────┘
```

## Troubleshooting

### "Not connected to backend"
- Verify backend is running: `curl http://localhost:3000/health`
- Check credentials in Connection tab
- Ensure no firewall blocking port 3000

### "Invalid or expired token"
- Re-enter password and click Connect
- Backend JWT tokens expire after 24h by default

### Memories not appearing
- Check that Auto Extract is enabled in Settings
- Verify backend logs for extraction errors
- Try manual extraction via backend API

### Mobile-specific issues
- Ensure backend is accessible from mobile network
- Use `http://<your-pc-ip>:3000` instead of `localhost`
- Check CORS settings in backend

## Development

### Structure

```
sillytavern-db-memory-extension/
├── manifest.json       # Extension metadata
├── index.js            # Main code (state, API, UI, sync)
├── ui/
│   └── main.html       # Panel HTML with tabs
└── styles/
    └── main.css        # Dark theme styles
```

### Testing

1. Start backend: `docker compose --profile backend up -d`
2. Create test user:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","password":"test123"}'
   ```
3. Install extension in SillyTavern
4. Connect with test credentials

## License

MIT License — see [LICENSE](LICENSE)

## Credits

- Inspired by [SillyTavern-Horae](https://github.com/SenriYuki/SillyTavern-Horae)
- Backend: [sillytavern-memory-backend](https://github.com/yourusername/sillytavern-memory-backend)
