# OpenClaw Package Update Guide

When you make changes to the OpenClaw codebase that need to be deployed to VPS, follow these steps.

## ⚠️ Files to Update (DON'T FORGET!)

| File                                      | What to Update                     |
| ----------------------------------------- | ---------------------------------- |
| `nix/sources/openclaw-source.nix`         | `rev`, `hash`, `pnpmDepsHash`      |
| `nix/packages/openclaw-gateway.nix` (:42) | `version` (match upstream release) |

## Repository Layout

| Path                                        | Purpose                                |
| ------------------------------------------- | -------------------------------------- |
| `/home/yumeko/github/clawdbot`              | OpenClaw fork (yumesha/openclaw)       |
| `/home/yumeko/github/clawdbot/nix-openclaw` | Nix packaging (yumesha/nix-openclaw)   |
| `/home/yumeko/github/clawdbot/vps-clawbot`  | VPS NixOS config (yumesha/vps-clawbot) |

## tmux Sessions

| Session | Purpose                        |
| ------- | ------------------------------ |
| `cup`   | Local builds, VPS rebuilds     |
| `net`   | SSH to VPS (netcup-1), testing |

## Step 1: Make Changes in OpenClaw Fork

```bash
cd /home/yumeko/github/clawdbot

# Make your changes to src/**
# ...

# Commit and push
git add -A && git commit -m "fix: your change" && git push
```

**Get the commit hash:**

```bash
git log -1 --format="%H"
# Example: 4a8becc40fe4baed1b28fccd13b0271f59755fcc
```

## Step 2: Update nix-openclaw Source

```bash
cd /home/yumeko/github/clawdbot/nix-openclaw
```

### 2a. Edit `nix/sources/openclaw-source.nix`:

```nix
{
  owner = "yumesha";
  repo = "openclaw";
  rev = "<NEW_COMMIT_HASH>";  # Update this
  hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";  # Will fail, get correct hash
  pnpmDepsHash = "sha256-...";  # May need update if deps changed
}
```

### 2b. ⚠️ Edit `nix/packages/openclaw-gateway.nix` (line 42):

**DON'T SKIP THIS!** Update version to match upstream release:

```nix
stdenv.mkDerivation (finalAttrs: {
  pname = "openclaw-gateway";
  version = "2026.2.15";  # Update to match upstream release
```

**Get correct hash:**

```bash
nix build .#openclaw 2>&1 | grep -E "(specified|got)"
# Update hash with the "got:" value
```

**If pnpmDepsHash fails, repeat:**

```bash
# Set pnpmDepsHash to placeholder, build again:
nix build .#openclaw 2>&1 | grep -E "(specified|got)"
# Update pnpmDepsHash with the "got:" value
```

**Verify build succeeds:**

```bash
nix build .#openclaw
ls -la result  # Should show symlink to nix store
```

**Commit and push:**

```bash
git add -A && git commit -m "fix: update openclaw source" && git push
```

## Step 3: Update vps-clawbot Flake Lock

```bash
cd /home/yumeko/github/clawdbot/vps-clawbot

# Update nix-openclaw input
nix flake update nix-openclaw

# Commit and push
git add -A && git commit -m "chore: update nix-openclaw" && git push
```

## Step 4: Rebuild VPS (tmux cup)

```bash
# In tmux cup session:
tmux send-keys -t cup "cd ~/github/clawdbot/vps-clawbot && git pull && cuprebuild" Enter
```

**Monitor progress:**

```bash
tmux capture-pane -t cup -p | tail -30
```

## Step 5: Test on VPS (tmux net)

```bash
# Connect to VPS
tmux send-keys -t net "ssh netcup-1" Enter

# Check OpenClaw version
tmux send-keys -t net "sudo -iu cupclawbot openclaw --version" Enter

# Check auth-profiles.json exists (home-manager activation may not have run)
tmux send-keys -t net "sudo -iu cupclawbot test -f ~/.openclaw/agents/main/agent/auth-profiles.json && echo 'auth-profiles.json: OK' || echo 'auth-profiles.json: MISSING - run manual fix'" Enter

# Check gateway status
tmux send-keys -t net "sudo -u cupclawbot XDG_RUNTIME_DIR=/run/user/\$(id -u cupclawbot) systemctl --user status openclaw-gateway" Enter

# Check channels
tmux send-keys -t net "sudo -iu cupclawbot openclaw channels status --probe" Enter

# Check OAuth token status
tmux send-keys -t net "sudo python3 -c \"import json,time; d=json.load(open('/home/cupclawbot/.openclaw/agents/main/agent/auth-profiles.json')); c=d['profiles'].get('anthropic:claude-cli',{}); exp=c.get('expires',0); now=int(time.time()*1000); print(f'valid: {exp > now}'); print(f'hours_left: {(exp-now)/3600000:.1f}')\"" Enter
```

## Quick Reference: Hash Update Flow

```
1. Update rev in openclaw-source.nix
2. ⚠️ Update version in openclaw-gateway.nix (line 42) ← DON'T FORGET!
3. Set hash = "sha256-AAA..."
4. nix build → get correct hash
5. Update hash with correct value
6. nix build → if pnpmDepsHash fails, repeat for pnpmDepsHash
7. nix build → should succeed
8. git commit && push
9. cd vps-clawbot && nix flake update nix-openclaw
10. git commit && push
11. Rebuild VPS in tmux cup
```

## Common Issues

### OAuth Token Expired

```bash
# Sync fresh credentials from local machine
cd ~/github/clawdbot/vps-clawbot
CREDS=$(python3 -c "import json; print(json.dumps(open('$HOME/.claude/.credentials.json').read()))")
sops --set '["claude-credentials"] '"$CREDS" secrets/clawbot.yaml
git add -A && git commit -m "chore: refresh OAuth credentials" && git push
# Then rebuild VPS
```

### Gateway Not Starting

```bash
# Check logs
tmux send-keys -t net "sudo -u cupclawbot XDG_RUNTIME_DIR=/run/user/\$(id -u cupclawbot) journalctl --user -u openclaw-gateway -n 50" Enter
```

### Missing auth-profiles.json (✅ Fixed)

**This issue is now permanently fixed.** A systemd user service (`openclaw-auth-setup.service`) runs automatically on boot and creates `auth-profiles.json` from SOPS secrets before the gateway starts.

**What was changed:**
- Added `systemd.user.services.openclaw-auth-setup` to all bot user configs
- Service runs after `sops-nix.service` (secrets available) and before `openclaw-gateway.service`
- Uses full nix store paths for all commands (fixes exit code 127 in systemd)

**Verification after rebuild:**
```bash
tmux send-keys -t net "sudo -u cupclawbot XDG_RUNTIME_DIR=/run/user/1001 systemctl --user status openclaw-auth-setup" Enter
# Should show: Active: active (exited) since ...

tmux send-keys -t net "sudo ls -la /home/cupclawbot/.openclaw/agents/main/agent/auth-profiles.json" Enter
# Should show the file exists
```

### Config Reset After Rebuild

NixOS rebuilds reset `openclaw.json`. Re-apply settings:

```bash
tmux send-keys -t net "sudo -iu cupclawbot openclaw config set auth.order.anthropic '[\"anthropic:claude-cli\"]'" Enter
tmux send-keys -t net "sudo -u cupclawbot XDG_RUNTIME_DIR=/run/user/\$(id -u cupclawbot) systemctl --user restart openclaw-gateway" Enter
```
