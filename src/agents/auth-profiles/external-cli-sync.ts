import type {
  AuthProfileCredential,
  AuthProfileStore,
  OAuthCredential,
  TokenCredential,
} from "./types.js";
import {
  readQwenCliCredentialsCached,
  readMiniMaxCliCredentialsCached,
  readClaudeCliCredentialsCached,
  type ClaudeCliCredential,
} from "../cli-credentials.js";
import {
  CLAUDE_CLI_PROFILE_ID,
  EXTERNAL_CLI_NEAR_EXPIRY_MS,
  EXTERNAL_CLI_SYNC_TTL_MS,
  QWEN_CLI_PROFILE_ID,
  MINIMAX_CLI_PROFILE_ID,
  log,
} from "./constants.js";

function shallowEqualOAuthCredentials(a: OAuthCredential | undefined, b: OAuthCredential): boolean {
  if (!a) {
    return false;
  }
  if (a.type !== "oauth") {
    return false;
  }
  return (
    a.provider === b.provider &&
    a.access === b.access &&
    a.refresh === b.refresh &&
    a.expires === b.expires &&
    a.email === b.email &&
    a.enterpriseUrl === b.enterpriseUrl &&
    a.projectId === b.projectId &&
    a.accountId === b.accountId
  );
}

function shallowEqualTokenCredentials(a: TokenCredential | undefined, b: TokenCredential): boolean {
  if (!a) {
    return false;
  }
  if (a.type !== "token") {
    return false;
  }
  return (
    a.provider === b.provider &&
    a.token === b.token &&
    a.expires === b.expires &&
    a.email === b.email
  );
}

function isExternalProfileFresh(cred: AuthProfileCredential | undefined, now: number): boolean {
  if (!cred) {
    return false;
  }
  if (cred.type !== "oauth" && cred.type !== "token") {
    return false;
  }
  if (
    cred.provider !== "qwen-portal" &&
    cred.provider !== "minimax-portal" &&
    cred.provider !== "anthropic"
  ) {
    return false;
  }
  if (typeof cred.expires !== "number") {
    return true;
  }
  return cred.expires > now + EXTERNAL_CLI_NEAR_EXPIRY_MS;
}

/**
 * Sync Claude CLI credentials into the store.
 * Handles both OAuth (with refresh token) and Token (access-only) credential types.
 * Prefers OAuth over Token because OAuth enables auto-refresh.
 */
function syncClaudeCliCredentials(
  store: AuthProfileStore,
  creds: ClaudeCliCredential,
  now: number,
): boolean {
  const existing = store.profiles[CLAUDE_CLI_PROFILE_ID];
  const credsExpires = creds.expires ?? 0;

  let shouldUpdate = false;
  let isEqual = false;

  if (creds.type === "oauth") {
    const existingOAuth = existing?.type === "oauth" ? existing : undefined;
    const oauthCred: OAuthCredential = {
      type: "oauth",
      provider: "anthropic",
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
    };
    isEqual = shallowEqualOAuthCredentials(existingOAuth, oauthCred);
    // Update if: no existing, type changed to oauth, expired, or CLI has newer token
    shouldUpdate =
      !existingOAuth ||
      existingOAuth.provider !== "anthropic" ||
      existingOAuth.expires <= now ||
      (credsExpires > now && credsExpires > existingOAuth.expires);

    // Prefer oauth over token (enables auto-refresh)
    if (existing && existing.type === "token") {
      shouldUpdate = true;
      isEqual = false;
    }

    if (shouldUpdate && !isEqual) {
      store.profiles[CLAUDE_CLI_PROFILE_ID] = oauthCred;
      log.info("synced anthropic oauth credentials from claude cli", {
        profileId: CLAUDE_CLI_PROFILE_ID,
        type: "oauth",
        expires: new Date(creds.expires).toISOString(),
      });
      return true;
    }
  } else {
    // Token type (no refresh capability)
    const existingToken = existing?.type === "token" ? existing : undefined;
    const tokenCred: TokenCredential = {
      type: "token",
      provider: "anthropic",
      token: creds.token,
      expires: creds.expires,
    };
    isEqual = shallowEqualTokenCredentials(existingToken, tokenCred);
    // Update if: no existing, expired, or CLI has newer token
    shouldUpdate =
      !existingToken ||
      existingToken.provider !== "anthropic" ||
      (existingToken.expires ?? 0) <= now ||
      (credsExpires > now && credsExpires > (existingToken.expires ?? 0));

    // Never downgrade from oauth to token
    if (existing?.type === "oauth") {
      shouldUpdate = false;
    }

    if (shouldUpdate && !isEqual) {
      store.profiles[CLAUDE_CLI_PROFILE_ID] = tokenCred;
      log.info("synced anthropic token credentials from claude cli", {
        profileId: CLAUDE_CLI_PROFILE_ID,
        type: "token",
        expires: new Date(creds.expires).toISOString(),
      });
      return true;
    }
  }

  return false;
}

/** Sync external CLI credentials into the store for a given provider. */
function syncExternalCliCredentialsForProvider(
  store: AuthProfileStore,
  profileId: string,
  provider: string,
  readCredentials: () => OAuthCredential | null,
  now: number,
): boolean {
  const existing = store.profiles[profileId];
  const shouldSync =
    !existing || existing.provider !== provider || !isExternalProfileFresh(existing, now);
  const creds = shouldSync ? readCredentials() : null;
  if (!creds) {
    return false;
  }

  const existingOAuth = existing?.type === "oauth" ? existing : undefined;
  const shouldUpdate =
    !existingOAuth ||
    existingOAuth.provider !== provider ||
    existingOAuth.expires <= now ||
    creds.expires > existingOAuth.expires;

  if (shouldUpdate && !shallowEqualOAuthCredentials(existingOAuth, creds)) {
    store.profiles[profileId] = creds;
    log.info(`synced ${provider} credentials from external cli`, {
      profileId,
      expires: new Date(creds.expires).toISOString(),
    });
    return true;
  }

  return false;
}

/**
 * Sync OAuth credentials from external CLI tools (Claude CLI, Qwen Code CLI, MiniMax CLI) into the store.
 * This allows OpenClaw to use the same credentials as these tools without requiring
 * separate authentication, and keeps credentials in sync when CLI tools refresh tokens.
 *
 * Returns true if any credentials were updated.
 */
export function syncExternalCliCredentials(
  store: AuthProfileStore,
  options?: { allowKeychainPrompt?: boolean },
): boolean {
  let mutated = false;
  const now = Date.now();

  // Sync from Claude CLI (supports OAuth with refresh token or token-only)
  const existingClaude = store.profiles[CLAUDE_CLI_PROFILE_ID];
  const shouldSyncClaude =
    !existingClaude ||
    existingClaude.provider !== "anthropic" ||
    existingClaude.type === "token" ||
    !isExternalProfileFresh(existingClaude, now);
  const claudeCreds = shouldSyncClaude
    ? readClaudeCliCredentialsCached({
        allowKeychainPrompt: options?.allowKeychainPrompt,
        ttlMs: EXTERNAL_CLI_SYNC_TTL_MS,
      })
    : null;
  if (claudeCreds && syncClaudeCliCredentials(store, claudeCreds, now)) {
    mutated = true;
  }

  // Sync from Qwen Code CLI
  const existingQwen = store.profiles[QWEN_CLI_PROFILE_ID];
  const shouldSyncQwen =
    !existingQwen ||
    existingQwen.provider !== "qwen-portal" ||
    !isExternalProfileFresh(existingQwen, now);
  const qwenCreds = shouldSyncQwen
    ? readQwenCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS })
    : null;
  if (qwenCreds) {
    const existing = store.profiles[QWEN_CLI_PROFILE_ID];
    const existingOAuth = existing?.type === "oauth" ? existing : undefined;
    const shouldUpdate =
      !existingOAuth ||
      existingOAuth.provider !== "qwen-portal" ||
      existingOAuth.expires <= now ||
      qwenCreds.expires > existingOAuth.expires;

    if (shouldUpdate && !shallowEqualOAuthCredentials(existingOAuth, qwenCreds)) {
      store.profiles[QWEN_CLI_PROFILE_ID] = qwenCreds;
      mutated = true;
      log.info("synced qwen credentials from qwen cli", {
        profileId: QWEN_CLI_PROFILE_ID,
        expires: new Date(qwenCreds.expires).toISOString(),
      });
    }
  }

  // Sync from MiniMax Portal CLI
  if (
    syncExternalCliCredentialsForProvider(
      store,
      MINIMAX_CLI_PROFILE_ID,
      "minimax-portal",
      () => readMiniMaxCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS }),
      now,
    )
  ) {
    mutated = true;
  }

  return mutated;
}
