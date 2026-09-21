# SillyTavern DB/Memory Extension

Database-backed memory extension for SillyTavern with PostgreSQL + pgvector backend.

## Features

- 🧠 Persistent Memory with pgvector embeddings
- 🔍 Semantic Search by similarity
- 🔄 Auto-Sync chat messages
- 🤖 AI-powered memory extraction
- 📱 Mobile ready (Android, iOS, Termux)
- 🌙 Dark theme matching SillyTavern UI

## Installation

### From Git URL

1. Open SillyTavern → Extensions (puzzle icon)
2. Click **Install Extension**
3. Paste: `https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git`
4. Click **Install** → Refresh page

### Manual

```bash
git clone https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git
# Copy folder to: SillyTavern/public/scripts/extensions/
```

## Requirements

- SillyTavern 1.10.0+
- Backend API (PostgreSQL + pgvector)
- Node.js backend running on port 3000

## Quick Start

1. **Start Backend**
   ```bash
   docker compose --profile backend up -d
   ```

2. **Create User**
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -d '{"username":"user","password":"pass123"}' \
     -H "Content-Type: application/json"
   ```

3. **Connect in SillyTavern**
   - Open DB Memory tab
   - Backend URL: `http://localhost:3000`
   - Enter credentials → Connect

## Mobile Setup

### Android/iOS (Remote Backend)

```
Backend URL: http://<YOUR_PC_IP>:3000
```

- Open port 3000 in firewall
- Use PC's local IP (e.g., 192.168.1.100)

### Termux (Local Backend)

Run backend directly in Termux, use `http://127.0.0.1:3000`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto Sync | ✓ | Sync messages automatically |
| Auto Extract | ✓ | Extract memories via AI |
| Memories per Context | 5 | Max memories shown |
| Similarity Threshold | 0.7 | Min relevance score |

## API Endpoints

- `GET /health` — Health check
- `POST /api/auth/login` — JWT token
- `POST /api/messages` — Create message
- `POST /api/memories/process` — Extract memories
- `GET /api/memories` — List memories
- `POST /api/context` — Build context

## Troubleshooting

**Not connected?**
```bash
curl http://localhost:3000/health
```

**Token expired?** Re-enter password and click Connect.

**Mobile can't connect?** Use PC IP, not localhost. Open firewall port 3000.

## License

MIT — see LICENSE file.

## Credits

Inspired by [SillyTavern-Horae](https://github.com/SenriYuki/SillyTavern-Horae)
