# SillyTavern DB/Memory Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.10.0+-blue)](https://github.com/SillyTavern/SillyTavern)
[![Backend](https://img.shields.io/badge/Backend-Node.js-green)](https://nodejs.org/)

Database-backed memory extension for SillyTavern with PostgreSQL + pgvector backend.

## ✨ Features

- 🧠 **Persistent Memory** — All memories stored in PostgreSQL with pgvector embeddings
- 🔍 **Semantic Search** — Find relevant memories by vector similarity
- 🔄 **Auto-Sync** — Automatically sync chat messages to backend
- 🤖 **Auto-Extract** — AI-powered memory extraction from messages
- 📱 **Mobile Ready** — Works on Android, iOS, and Termux
- 🌙 **Dark Theme** — Matches SillyTavern UI perfectly

## 📦 Installation

### From Git URL (Recommended)

1. Open SillyTavern → Extensions panel (puzzle icon)
2. Click **Install Extension**
3. Paste repository URL
4. Click **Install**
5. Refresh the page

### Manual

```bash
git clone https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git
# Copy to SillyTavern/extensions/
```

## 🚀 Quick Start

1. **Start Backend**
   ```bash
   cd sillytavern-memory-backend
   docker compose --profile backend up -d
   ```

2. **Create User**
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"myuser","password":"mypass123"}'
   ```

3. **Connect Extension**
   - Open SillyTavern → DB Memory tab
   - Enter Backend URL: `http://localhost:3000`
   - Enter username/password
   - Click **Connect**

## 📱 Mobile Usage

### Android (Termux + Local Backend)

```bash
# In Termux
pkg install postgresql
# Run backend on localhost:3000
# In SillyTavern PWA: http://127.0.0.1:3000
```

### Android (Remote Backend)

```
Backend URL: http://<your-pc-ip>:3000
# Ensure port 3000 is open in firewall
```

### iOS (Safari PWA)

Same as Android — use remote backend URL with your PC's IP address.

## 🔧 Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Auto Sync | ✓ | Sync messages automatically |
| Auto Extract | ✓ | Extract memories from messages |
| Memories per Context | 5 | Max memories injected |
| Similarity Threshold | 0.7 | Min relevance (0.0-1.0) |

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ SillyTavern │ ───▶ │  Extension   │ ───▶ │   Backend   │
│   (Client)  │      │  (JWT Auth)  │      │  (Node.js)  │
└─────────────┘      └──────────────┘      └──────┬──────┘
                                                  │
                                                  ▼
                                         ┌───────────────┐
                                         │  PostgreSQL   │
                                         │  + pgvector   │
                                         └───────────────┘
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/auth/login` | POST | JWT authentication |
| `/api/messages` | POST | Create message |
| `/api/memories` | GET | List memories |
| `/api/memories/process` | POST | Extract memories |
| `/api/context` | POST | Build context |

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Not connected | Check backend is running: `curl http://localhost:3000/health` |
| Invalid token | Re-enter password and click Connect |
| No memories | Enable Auto Extract in Settings |
| Mobile can't connect | Use PC IP instead of localhost, open port 3000 |

## 📄 License

MIT License — see [LICENSE](LICENSE) file.

## 🔗 Links

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Backend Repository](https://github.com/YOUR_USERNAME/sillytavern-memory-backend)
- [Horae Extension (inspiration)](https://github.com/SenriYuki/SillyTavern-Horae)
