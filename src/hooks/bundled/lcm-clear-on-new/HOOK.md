---
name: lcm-clear-on-new
description: "Clears LCM (lossless-claw) data when /new or /reset commands are executed"
metadata: { "openclaw": { "events": ["command:new", "command:reset"] } }
---

# LCM Clear on New/Reset

This hook clears LCM (Local Context Memory) data when the user executes `/new` or `/reset` commands.

## How It Works

1. Registers as a bundled hook loaded at startup (before any commands are processed)
2. Uses a global registry pattern to integrate with the lossless-claw plugin
3. When the LCM plugin loads, it registers its `clearForSession` function
4. When `/new` or `/reset` is triggered, the hook calls the registered clear function

## Integration with lossless-claw Plugin

The LCM plugin registers itself using the bundled hook's registry when loaded.

## Events

- `command:new` - Triggered when user sends `/new`
- `command:reset` - Triggered when user sends `/reset`
