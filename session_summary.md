# Session Summary: OAuth Auto-Refresh + Moonshot Video Provider

## Status: ✅ OAuth Complete | 🔧 Moonshot Pending Deploy

---

## Part 3: Session Context Compaction + Kimi Default Model (COMPLETE - Mar 2, 2026)

### Summary

Successfully preserved session context through compaction and switched default model from Claude to Kimi k2.5.

### Issues Fixed

| Issue                   | Root Cause                                                                  | Solution                                                 |
| ----------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Tool Use Error**      | Context at 188k/200k (94%) caused aborted request with orphaned tool_result | Compaction triggered, but bug in transcript repair logic |
| **Model Not Switching** | Session entry stores `model`/`modelProvider` at creation, overriding config | Cleared session model fields to use config default       |
| **Wrong Context Size**  | Session stored `contextTokens: 200000` from Claude                          | Updated to 256000 for Kimi k2.5                          |
| **MEMORY.md Truncated** | File was 19,937 chars (>12,775 limit)                                       | Trimmed to 5,546 chars with essential context            |
| **Kimi Auth Missing**   | No auth profile for `kimi-coding` provider                                  | Created `kimi-coding:kimi-code` profile                  |

### Configuration Changes

#### `~/.openclaw/openclaw.json`

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "kimi-coding/k2p5",
        "fallbacks": ["anthropic/claude-opus-4-6"]
      }
    }
  }
}
```

#### `~/.openclaw/agents/main/agent/auth-profiles.json`

Added:

```json
"kimi-coding:kimi-code": {
  "type": "oauth",
  "provider": "kimi-coding",
  "access": "eyJhbGciOiJIUzI1NiIs...",
  "refresh": "eyJhbGciOiJIUzI1NiIs...",
  "expires": 1772050457955
}
```

#### `~/.openclaw/workspace/MEMORY.md`

Added compaction summary:

```markdown
## Previous Session Summary (Mar 1, 2026)

- OpenAntler LLC: Delaware LLC, Stripe Atlas, Feb 2026, has EIN, no ITIN
- ITIN plan: ITINCAA Singapore 750 SGD, or Just Breve UK backup
- Hyprland: uses hyprctl for cursor, not ydotool absolute
- Browser CDP: Chromium at :9222, attachOnly mode
- OCR + click workflow working
- NixOS config: ~/github/nixos-anywhere/nixos-proxmox-VM/
```

### Current Status

```
🟢 Model: kimi-coding/k2p5 (256k context)
🟢 Session: agent:main:main - 19k/256k (7%)
🟢 MEMORY.md: 5,546 chars (under 12,775 limit)
🟢 Auth: kimi-coding profile configured
🟢 Fallback: anthropic/claude-opus-4-6
```

### Key Insight: Session Model Storage

Sessions store model at creation time in `sessions.json`:

```json
{
  "model": "claude-opus-4-6",
  "modelProvider": "anthropic",
  "contextTokens": 200000
}
```

These fields **override** config defaults! To switch models for existing sessions:

```bash
# Clear session model fields
python3 -c "
import json
d = json.load(open('$HOME/.openclaw/agents/main/sessions/sessions.json'))
e = d.get('agent:main:main', {})
e.pop('model', None)
e.pop('modelProvider', None)
e['contextTokens'] = 256000  # Update for new model
json.dump(d, open('$HOME/.openclaw/agents/main/sessions/sessions.json', 'w'), indent=2)
"
```

---

## Part 4: QMD Third-Party Embedding Providers with Voyage 4 (COMPLETE - Mar 2, 2026)

### Summary

Implemented third-party embedding backend for QMD (Queryable Memory Database) to enable fast embeddings on CPU-only VMs without requiring local GGUF models.

### Implementation

#### OpenClaw Core Changes

| File                                | Change                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| `src/config/types.memory.ts`        | Added `QmdEmbeddingProvider` type and config structs            |
| `src/config/zod-schema.ts`          | Added Zod validation for embedding providers                    |
| `src/memory/backend-config.ts`      | Added `resolveEmbeddingProvider()` with env var support         |
| `src/memory/qmd-embeddings.ts`      | New embedding provider implementations (OpenAI, Gemini, Voyage) |
| `src/memory/qmd-manager.ts`         | Integrated providers, pass config via environment               |
| `src/memory/qmd-embeddings.test.ts` | Unit tests for embedding providers                              |
| `src/memory/backend-config.test.ts` | Tests for config resolution                                     |

#### NixOS Configuration Changes

| File                                                   | Change                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| `nix-openclaw/nix/sources/openclaw-source.nix`         | Updated to v2026.3.2                     |
| `nixos-proxmox-VM/modules/openclaw-custom/qmd.nix`     | Auto-configure Voyage when secret exists |
| `nixos-proxmox-VM/modules/openclaw-custom/default.nix` | Load VOYAGE_API_KEY in service wrapper   |
| `nixos-proxmox-VM/modules/openclaw-custom/secrets.nix` | Added openclaw-voyage-api secret         |
| `nixos-proxmox-VM/flake.nix`                           | Enabled `openclaw.qmd.enable = true`     |

### Configuration

#### `~/.openclaw/openclaw.json`

```json
{
  "memory": {
    "backend": "qmd",
    "qmd": {
      "embeddings": {
        "provider": "voyage",
        "voyage": {
          "apiKey": "$VOYAGE_API_KEY",
          "model": "voyage-4",
          "batchSize": 128
        }
      }
    }
  }
}
```

#### SOPS Secret

```yaml
openclaw-voyage-api: ENC[AES256_GCM,...]
```

### Features

- ✅ **Providers**: local (GGUF), openai, gemini, voyage
- ✅ **Environment Variable Support**: `$VAR` or `env:VAR` syntax
- ✅ **Batching**: Configurable batch sizes for API efficiency
- ✅ **Health Checks**: Provider availability probing
- ✅ **Fallback**: Graceful degradation on API errors

### Commits

```
openclaw:           6d5107a69 feat(memory): add third-party embedding providers for QMD
nix-openclaw:       dfce73f   feat: update to OpenClaw v2026.3.2
nixos-proxmox-VM:   f15dd82   feat: enable QMD with Voyage 4 embeddings
```

### Tag

- **v2026.3.2**: https://github.com/yumesha/openclaw/releases/tag/v2026.3.2

---

## Part 1: OAuth Auto-Refresh (COMPLETE)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OAUTH FLOW (zani as source)                   │
├─────────────────────────────────────────────────────────────────┤
│  1. SOPS → zani's ~/.claude/.credentials.json (on boot)          │
│  2. oauth-refresh.timer runs every 2-4 hours (random)            │
│  3. Runs `claude --version` as zani                              │
│  4. Claude CLI internally refreshes token if needed              │
│  5. Sync updated credentials → SOPS → git push                   │
│  6. Bots read from SOPS on rebuild                               │
│  7. OPENCLAW_SKIP_CLAUDE_CLI_SYNC=1 prevents bots writing ~/.claude│
└─────────────────────────────────────────────────────────────────┘
```

### Key Files (vps-clawbot)

| File                     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `modules/oauth-sync.nix` | Systemd timer/service for zani OAuth refresh |
| `users/zani.nix`         | Home-manager config with claude-code package |

### Credentials Format Required

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1771245291992,
    "scopes": ["user:inference", "user:profile", "user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_5x"
  }
}
```

### Syncing Credentials from Local

```bash
cd ~/github/clawdbot/vps-clawbot
CREDS=$(python3 -c "import json; print(json.dumps(json.dumps(json.load(open('$HOME/.claude/.credentials.json')))))")
sops --set '["claude-credentials"] '$CREDS secrets/clawbot.yaml
git add -A && git commit -m "chore: refresh credentials" && git push
```

---

## Part 2: Moonshot Video Provider (PENDING DEPLOY)

### PR #12063 Implementation

Added Moonshot AI (Kimi K2.5) as native video understanding provider.

### Files Created/Modified (openclaw)

| File                                                  | Change                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| `src/media-understanding/providers/moonshot/index.ts` | New provider registration                    |
| `src/media-understanding/providers/moonshot/video.ts` | Video description via K2.5 API               |
| `src/media-understanding/providers/index.ts`          | Added moonshotProvider                       |
| `src/media-understanding/defaults.ts`                 | Added "moonshot" to AUTO_VIDEO_KEY_PROVIDERS |
| `src/media-understanding/runner.entries.ts`           | Fixed baseUrl/headers for video providers    |

### Current Commits

```
openclaw:     4785bde62 feat: add Moonshot (Kimi K2.5) native video understanding provider
nix-openclaw: 1fc3021   feat: update openclaw with Moonshot video provider
vps-clawbot:  07f083d   chore: update nix-openclaw with Moonshot video provider
```

### Local-Only Files (not committed)

- `.gitignore` (modified)
- `OPENCLAW_PACKAGE_AUTO_FIX.md` (untracked)

---

## Testing Commands

### OAuth Refresh

```bash
# Check timer
sudo systemctl status oauth-refresh.timer
sudo systemctl list-timers oauth-refresh.timer

# Check token validity
sudo -iu zani python3 -c "import json,time; d=json.load(open('/home/zani/.claude/.credentials.json')); exp=d.get('claudeAiOauth',{}).get('expiresAt',0); now=int(time.time()*1000); print(f'valid: {exp > now}'); print(f'hours_left: {(exp-now)/3600000:.1f}')"

# Test Claude CLI
sudo -iu zani claude -p 'say hi' --max-turns 1

# Manual refresh
sudo systemctl start oauth-refresh.service
sudo journalctl -u oauth-refresh.service -n 50 --no-pager
```

### Moonshot Video (after deploy)

```bash
# Check if moonshot provider available
sudo -iu cupclawbot openclaw models list

# Test video with MOONSHOT_API_KEY set
# (requires Moonshot API key in environment)
```

### Session Context Compaction

```bash
# Check current session
openclaw sessions

# Check model and context
openclaw status | grep -E "Model|Session"

# Check MEMORY.md size
wc -c ~/.openclaw/workspace/MEMORY.md

# View gateway logs
journalctl --user -u openclaw-gateway -n 50 --no-pager
```

---

## Next Steps

1. ✅ ~~Fix session context compaction issue~~ (DONE - Mar 2, 2026)
2. ✅ ~~Switch default model to Kimi k2.5~~ (DONE - Mar 2, 2026)
3. Deploy vps-clawbot to VPS: `nixos-rebuild switch --flake .#clawbot --target-host netcup-1 --use-remote-sudo`
4. Test Moonshot video provider (need MOONSHOT_API_KEY)
5. Review PRs #12964 and #4459 for additional model updates

---

## Related PRs Reviewed

| PR     | Title                         | Verdict                                    |
| ------ | ----------------------------- | ------------------------------------------ |
| #12063 | Moonshot video provider       | ✅ Implemented                             |
| #12964 | Venice catalog update         | Good, needs type fix                       |
| #4459  | Kimi image + stale config fix | More important - fixes architectural issue |

---

_Last updated: Mar 2, 2026 (added QMD Voyage 4 support)_
