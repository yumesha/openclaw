/**
 * LCM Clear on New/Reset - Bundled hook for clearing LCM data
 *
 * This hook integrates with the lossless-claw plugin to clear LCM data
 * when /new or /reset commands are executed. It uses a per-agent registry
 * pattern so the LCM plugin can register its clear function when loaded.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { HookHandler } from "../../hooks.js";

const log = createSubsystemLogger("hooks/lcm-clear-on-new");

/**
 * Per-agent registry for LCM plugin integration
 * The LCM plugin registers its clear function here when loaded, per agent
 */
export type LcmClearFn = (sessionId: string) => Promise<boolean>;

interface LcmRegistry {
  clearFns: Record<string, LcmClearFn>;
}

// Per-agent registry - keyed by agentId
const globalRegistry: LcmRegistry = {
  clearFns: {},
};

/**
 * Get the global LCM registry (for LCM plugin to register itself)
 * Now accepts agentId as first parameter for per-agent registration
 */
export function getLcmClearRegistry(): {
  register: (agentId: string, clearFn: LcmClearFn) => void;
} {
  return {
    register: (agentId: string, clearFn: LcmClearFn) => {
      globalRegistry.clearFns[agentId] = clearFn;
      log.info(`[lcm-clear] LCM clear function registered for agent: ${agentId}`);
    },
  };
}

/**
 * Clear all LCM data for an agent by directly deleting from SQLite using Node.js
 * This is more thorough than clearForSession which only clears one session
 */
async function clearAllLcmData(agentId: string): Promise<boolean> {
  const dbPath = path.join(os.homedir(), ".openclaw", `lcm-${agentId}.db`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[LCM CLEAR HANDLER] Database not found: ${dbPath}`);
    return false;
  }

  try {
    // Use Node.js's built-in SQLite (available in Node 22+)
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath);

    // Count ALL conversations (including legacy data with null session_key)
    const totalCountStmt = db.prepare("SELECT COUNT(*) as count FROM conversations;");
    const totalResult = totalCountStmt.get() as { count: number } | undefined;
    const totalCount = totalResult?.count || 0;
    console.error(`[LCM CLEAR HANDLER] Found ${totalCount} total conversations in ${dbPath}`);

    // Also count by session_key pattern
    const agentCountStmt = db.prepare(
      "SELECT COUNT(*) as count FROM conversations WHERE session_key LIKE ?;",
    );
    const agentResult = agentCountStmt.get(`agent:${agentId}:%`) as { count: number } | undefined;
    const agentCount = agentResult?.count || 0;
    console.error(`[LCM CLEAR HANDLER] Found ${agentCount} conversations for agent ${agentId}`);

    if (totalCount === 0) {
      db.close();
      return false;
    }

    // Delete ALL conversations (clear entire database for this agent)
    // This cascades to messages, summaries, etc. via foreign keys
    const deleteStmt = db.prepare("DELETE FROM conversations;");
    deleteStmt.run();

    console.error(`[LCM CLEAR HANDLER] Deleted ${totalCount} conversations from ${dbPath}`);

    // Try to vacuum to reclaim space
    try {
      db.exec("VACUUM;");
      console.error(`[LCM CLEAR HANDLER] Database vacuumed successfully`);
    } catch (vacuumErr) {
      // Vacuum is optional, ignore errors
      console.error(`[LCM CLEAR HANDLER] Vacuum skipped: ${String(vacuumErr)}`);
    }

    db.close();
    return true;
  } catch (err) {
    console.error(`[LCM CLEAR HANDLER] Failed to clear database: ${String(err)}`);
    return false;
  }
}

/**
 * Hook handler to clear LCM data on /new or /reset commands
 * Clears ALL LCM data for the agent (entire database), not just one session
 */
const clearLcmOnNew: HookHandler = async (event) => {
  // Debug: Log entry
  console.error(
    `[LCM CLEAR HANDLER] Triggered: type=${event.type}, action=${event.action}, sessionKey=${event.sessionKey}`,
  );

  // Only trigger on reset/new commands
  const isResetCommand = event.action === "new" || event.action === "reset";
  if (event.type !== "command" || !isResetCommand) {
    console.error(`[LCM CLEAR HANDLER] Skipping: not a reset/new command`);
    return;
  }

  // Get session ID from session key
  const sessionKey = event.sessionKey;
  if (!sessionKey) {
    console.error("[LCM CLEAR HANDLER] No session key provided, skipping clear");
    return;
  }

  // Extract agent ID from sessionKey (format: agent:{agentId}:...)
  // Fallback to context.agentId or "client"
  const sessionKeyMatch = sessionKey.match(/^agent:([^:]+):/);
  const agentIdFromSession = sessionKeyMatch ? sessionKeyMatch[1] : undefined;
  const agentId =
    agentIdFromSession ||
    (typeof event.context?.agentId === "string" && event.context.agentId
      ? event.context.agentId
      : "client");
  console.error(
    `[LCM CLEAR HANDLER] Agent ID: ${agentId} (from sessionKey: ${agentIdFromSession || "fallback"})`,
  );

  try {
    // Clear ALL LCM data for this agent (entire database, not just one session)
    console.error(`[LCM CLEAR HANDLER] Clearing ALL LCM data for agent: ${agentId}`);
    const cleared = await clearAllLcmData(agentId);

    if (cleared) {
      console.error(
        `[LCM CLEAR HANDLER] ✅ Cleared ALL LCM data on /${event.action} for agent '${agentId}'`,
      );
      log.info(`[lcm-clear] Cleared ALL LCM data on /${event.action} for agent '${agentId}'`);
    } else {
      console.error(
        `[LCM CLEAR HANDLER] ℹ️ No LCM data to clear on /${event.action} for agent '${agentId}'`,
      );
      log.debug(`[lcm-clear] No LCM data to clear on /${event.action} for agent '${agentId}'`);
    }
  } catch (err) {
    console.error(`[LCM CLEAR HANDLER] ❌ Failed to clear LCM data: ${String(err)}`);
    log.error(
      `[lcm-clear] Failed to clear LCM data on /${event.action} for agent '${agentId}': ${String(err)}`,
    );
  }
};

export default clearLcmOnNew;
