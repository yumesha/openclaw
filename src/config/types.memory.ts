import type { SessionSendPolicyConfig } from "./types.base.js";

export type MemoryBackend = "builtin" | "qmd";
export type MemoryCitationsMode = "auto" | "on" | "off";
export type MemoryQmdSearchMode = "query" | "search" | "vsearch";
export type QmdEmbeddingProvider = "local" | "openai" | "gemini" | "voyage";

export type MemoryConfig = {
  backend?: MemoryBackend;
  citations?: MemoryCitationsMode;
  qmd?: MemoryQmdConfig;
};

export type MemoryQmdConfig = {
  command?: string;
  mcporter?: MemoryQmdMcporterConfig;
  searchMode?: MemoryQmdSearchMode;
  includeDefaultMemory?: boolean;
  paths?: MemoryQmdIndexPath[];
  sessions?: MemoryQmdSessionConfig;
  update?: MemoryQmdUpdateConfig;
  limits?: MemoryQmdLimitsConfig;
  scope?: SessionSendPolicyConfig;
  embeddings?: QmdEmbeddingsConfig;
};

export type QmdEmbeddingsConfig = {
  provider?: QmdEmbeddingProvider;
  local?: QmdLocalEmbeddingConfig;
  openai?: QmdOpenAIEmbeddingConfig;
  gemini?: QmdGeminiEmbeddingConfig;
  voyage?: QmdVoyageEmbeddingConfig;
};

export type QmdLocalEmbeddingConfig = {
  modelPath?: string;
};

export type QmdOpenAIEmbeddingConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  batchSize?: number;
  dimensions?: number;
};

export type QmdGeminiEmbeddingConfig = {
  apiKey?: string;
  model?: string;
  batchSize?: number;
};

export type QmdVoyageEmbeddingConfig = {
  apiKey?: string;
  model?: string;
  batchSize?: number;
};

export type MemoryQmdMcporterConfig = {
  /**
   * Route QMD searches through mcporter (MCP runtime) instead of spawning `qmd` per query.
   * Requires:
   * - `mcporter` installed and on PATH
   * - A configured mcporter server that runs `qmd mcp` with `lifecycle: keep-alive`
   */
  enabled?: boolean;
  /** mcporter server name (defaults to "qmd") */
  serverName?: string;
  /** Start the mcporter daemon automatically (defaults to true when enabled). */
  startDaemon?: boolean;
};

export type MemoryQmdIndexPath = {
  path: string;
  name?: string;
  pattern?: string;
};

export type MemoryQmdSessionConfig = {
  enabled?: boolean;
  exportDir?: string;
  retentionDays?: number;
};

export type MemoryQmdUpdateConfig = {
  interval?: string;
  debounceMs?: number;
  onBoot?: boolean;
  waitForBootSync?: boolean;
  embedInterval?: string;
  commandTimeoutMs?: number;
  updateTimeoutMs?: number;
  embedTimeoutMs?: number;
};

export type MemoryQmdLimitsConfig = {
  maxResults?: number;
  maxSnippetChars?: number;
  maxInjectedChars?: number;
  timeoutMs?: number;
};
