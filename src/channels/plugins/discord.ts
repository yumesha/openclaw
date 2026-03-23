// Discord channel plugin - registers the outbound adapter for cron delivery
// This complements the full Discord extension in extensions/discord/
// by ensuring the outbound adapter is always available for delivery.

import {
  discordOutbound,
  normalizeDiscordOutboundTarget,
} from "./outbound/discord.js";
import type { ChannelPlugin } from "./types.js";

/**
 * Minimal Discord channel plugin that registers the outbound adapter.
 * This ensures Discord delivery works even when the full extension
 * isn't loaded or when running in isolated/cron contexts.
 */
export const discordChannelPlugin: ChannelPlugin = {
  id: "discord",
  meta: {
    id: "discord",
    label: "Discord",
    selectionLabel: "Discord (Bot API)",
    docsPath: "/channels/discord",
    blurb: "Discord channel for bot messaging.",
  },
  capabilities: {
    chatTypes: ["direct", "channel", "thread"],
    polls: true,
    reactions: true,
    media: true,
    nativeCommands: true,
    threads: true,
  },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
  outbound: discordOutbound,
};

// Also export the outbound adapter directly for convenience
export { discordOutbound, normalizeDiscordOutboundTarget };
