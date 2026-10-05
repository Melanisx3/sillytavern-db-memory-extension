# DB Memory Extension - Testing & Troubleshooting

## Quick Start

### 1. Start Backend Server
```bash
cd /c/prog/curse3
docker compose --profile backend up -d
```

### 2. Verify Backend is Running
```bash
curl http://localhost:3000/health
# Expected response: {"status":"ok","postgres":true,"pgvector":true,...}
```

### 3. Test API Endpoints
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test_user","password":"testpass123"}'

# Expected: JWT token in response
```

### 4. Install Extension in SillyTavern
- Open SillyTavern settings → Extensions
- Find "DB Memory Extension" 
- Enable it (loading order: 100)

## Testing Auto-Sync Features

### Configuration (in SillyTavern UI)
1. Set **Backend URL**: `http://192.168.1.70:3000` (or your phone's IP)
2. Enter credentials: `test_user` / `testpass123`
3. Click **Connect**
4. Enable **Auto-sync messages to database**
5. Enable **Auto-extract memories from messages**

### What Should Happen
- Every message sent in chat → auto-saved to PostgreSQL
- Messages processed by memory extraction engine
- Relevant memories retrieved when character responds

## Browser Console Debugging

Open browser console (F12) and look for:
```
[DB Memory] Initializing...
[DB Memory] Loading template...
[DB Memory] Connected successfully!
[DB Memory] Auto-saved message: {...}
```

## Common Issues & Solutions

### Issue: Extension not loading
- Check manifest.json points to correct JS file
- Clear browser cache
- Reload SillyTavern page

### Issue: Connection fails
- Verify backend running: `docker ps | grep sillytavern-memory-backend`
- Check firewall allows port 3000
- Test with curl first: `curl http://YOUR_IP:3000/health`

### Issue: Auto-sync not working on mobile
- Ensure JavaScript eventSource works on your Android version
- Try ultra-minimal version (`ultra-minimal-index.js`) for compatibility
- Check browser console for errors

### Issue: Token expired
- Disconnect and reconnect in SillyTavern UI
- Token valid for ~1 hour, auto-renewal should trigger

## Mobile Compatibility

If fullscreen UI hangs on phone:
1. Use **ultra-minimal-index.js** instead of main extension
2. Or test with **minimal-index.js**
3. Remove from SillyTavern via emergency removal script if needed

## Emergency Removal

To completely remove extension from SillyTavern:
1. Delete from `sillytavern-db-memory-extension` folder
2. Edit SillyTavern extensions config
3. Run browser console: `localStorage.removeItem('db_memory_settings')`

## API Reference

### POST /api/auth/login
```json
{ "username": "test_user", "password": "testpass123" }
Returns: { "token": "jwt_token..." }
```

### POST /api/memories/process
```json
{
  "content": "message text",
  "role": "user|assistant",
  "chatId": "chat_id",
  "characterId": "char_id",
  "sourceMessageId": "message_id"
}
Returns: memory extraction results
```

### POST /api/context
```json
{
  "query": "search query",
  "memoryLimit": 5,
  "similarityThreshold": 0.7
}
Returns: { "entries": [...], "messageContext": [...] }
```

## Next Steps

1. **Test basic sync**: Send a message, check if appears in database
2. **Test memory extraction**: Configure importance thresholds
3. **Test retrieval**: Ask character questions about past conversations
4. **Monitor performance**: Check `/health` endpoint for DB/vector status
