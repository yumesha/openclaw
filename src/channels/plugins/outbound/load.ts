import { createChannelRegistryLoader } from "../registry-loader.js";
import type { ChannelId, ChannelOutboundAdapter } from "../types.js";
import { discordOutbound } from "./discord.js";

// Channel docking: outbound sends should stay cheap to import.
//
// The full channel plugins (src/channels/plugins/*.ts) pull in status,
// onboarding, gateway monitors, etc. Outbound delivery only needs chunking +
// send primitives, so we keep a dedicated, lightweight loader here.
const loadOutboundAdapterFromRegistry = createChannelRegistryLoader<ChannelOutboundAdapter>(
  (entry) => entry.plugin.outbound,
);

// Fallback outbound adapters for core channels.
// These are used when the full channel plugin isn't registered (e.g., during
// cron delivery when the Discord extension might not be loaded).
const CORE_OUTBOUND_ADAPTERS: Record<string, ChannelOutboundAdapter> = {
  discord: discordOutbound,
};

export async function loadChannelOutboundAdapter(
  id: ChannelId,
): Promise<ChannelOutboundAdapter | undefined> {
  // First try to load from the plugin registry (preferred - includes full config)
  const fromRegistry = await loadOutboundAdapterFromRegistry(id);
  if (fromRegistry) {
    return fromRegistry;
  }

  // Fall back to core adapters for known channels
  return CORE_OUTBOUND_ADAPTERS[id];
}
