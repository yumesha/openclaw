import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveMemoryBackendConfig } from "./backend-config.js";

describe("resolveMemoryBackendConfig", () => {
  it("defaults to builtin backend when config missing", () => {
    const cfg = { agents: { defaults: { workspace: "/tmp/memory-test" } } } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.backend).toBe("builtin");
    expect(resolved.citations).toBe("auto");
    expect(resolved.qmd).toBeUndefined();
  });

  it("resolves qmd backend with default collections", () => {
    const cfg = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {},
      },
    } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.backend).toBe("qmd");
    expect(resolved.qmd?.collections.length).toBeGreaterThanOrEqual(3);
    expect(resolved.qmd?.command).toBe("qmd");
    expect(resolved.qmd?.searchMode).toBe("search");
    expect(resolved.qmd?.update.intervalMs).toBeGreaterThan(0);
    expect(resolved.qmd?.update.waitForBootSync).toBe(false);
    expect(resolved.qmd?.update.commandTimeoutMs).toBe(30_000);
    expect(resolved.qmd?.update.updateTimeoutMs).toBe(120_000);
    expect(resolved.qmd?.update.embedTimeoutMs).toBe(120_000);
    const names = new Set((resolved.qmd?.collections ?? []).map((collection) => collection.name));
    expect(names.has("memory-root-main")).toBe(true);
    expect(names.has("memory-alt-main")).toBe(true);
    expect(names.has("memory-dir-main")).toBe(true);
  });

  it("parses quoted qmd command paths", () => {
    const cfg = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          command: '"/Applications/QMD Tools/qmd" --flag',
        },
      },
    } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.command).toBe("/Applications/QMD Tools/qmd");
  });

  it("resolves custom paths relative to workspace", () => {
    const cfg = {
      agents: {
        defaults: { workspace: "/workspace/root" },
        list: [{ id: "main", workspace: "/workspace/root" }],
      },
      memory: {
        backend: "qmd",
        qmd: {
          paths: [
            {
              path: "notes",
              name: "custom-notes",
              pattern: "**/*.md",
            },
          ],
        },
      },
    } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    const custom = resolved.qmd?.collections.find((c) => c.name.startsWith("custom-notes"));
    expect(custom).toBeDefined();
    const workspaceRoot = resolveAgentWorkspaceDir(cfg, "main");
    expect(custom?.path).toBe(path.resolve(workspaceRoot, "notes"));
  });

  it("scopes qmd collection names per agent", () => {
    const cfg = {
      agents: {
        defaults: { workspace: "/workspace/root" },
        list: [
          { id: "main", default: true, workspace: "/workspace/root" },
          { id: "dev", workspace: "/workspace/dev" },
        ],
      },
      memory: {
        backend: "qmd",
        qmd: {
          includeDefaultMemory: true,
          paths: [{ path: "notes", name: "workspace", pattern: "**/*.md" }],
        },
      },
    } as OpenClawConfig;
    const mainResolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    const devResolved = resolveMemoryBackendConfig({ cfg, agentId: "dev" });
    const mainNames = new Set(
      (mainResolved.qmd?.collections ?? []).map((collection) => collection.name),
    );
    const devNames = new Set(
      (devResolved.qmd?.collections ?? []).map((collection) => collection.name),
    );
    expect(mainNames.has("memory-dir-main")).toBe(true);
    expect(devNames.has("memory-dir-dev")).toBe(true);
    expect(mainNames.has("workspace-main")).toBe(true);
    expect(devNames.has("workspace-dev")).toBe(true);
  });

  it("resolves qmd update timeout overrides", () => {
    const cfg = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          update: {
            waitForBootSync: true,
            commandTimeoutMs: 12_000,
            updateTimeoutMs: 480_000,
            embedTimeoutMs: 360_000,
          },
        },
      },
    } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.update.waitForBootSync).toBe(true);
    expect(resolved.qmd?.update.commandTimeoutMs).toBe(12_000);
    expect(resolved.qmd?.update.updateTimeoutMs).toBe(480_000);
    expect(resolved.qmd?.update.embedTimeoutMs).toBe(360_000);
  });

  it("resolves qmd search mode override", () => {
    const cfg = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          searchMode: "vsearch",
        },
      },
    } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.searchMode).toBe("vsearch");
  });

  it("defaults to local embedding provider", () => {
    const cfg = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {},
      },
    } as OpenClawConfig;
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.embeddings.provider).toBe("local");
    expect(resolved.qmd?.embeddings.local).toBeDefined();
  });

  it("resolves OpenAI embedding configuration", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          embeddings: {
            provider: "openai",
            openai: {
              apiKey: "sk-test-key",
              model: "text-embedding-3-large",
              baseUrl: "https://custom.openai.com/v1",
              batchSize: 50,
              dimensions: 3072,
            },
          },
        },
      },
    };
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.embeddings.provider).toBe("openai");
    expect(resolved.qmd?.embeddings.openai?.model).toBe("text-embedding-3-large");
    expect(resolved.qmd?.embeddings.openai?.baseUrl).toBe("https://custom.openai.com/v1");
    expect(resolved.qmd?.embeddings.openai?.batchSize).toBe(50);
    expect(resolved.qmd?.embeddings.openai?.dimensions).toBe(3072);
    expect(resolved.qmd?.embeddings.openai?.apiKey).toBe("sk-test-key");
  });

  it("resolves Gemini embedding configuration", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          embeddings: {
            provider: "gemini",
            gemini: {
              apiKey: "gemini-test-key",
              model: "gemini-embedding-001",
              batchSize: 64,
            },
          },
        },
      },
    };
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.embeddings.provider).toBe("gemini");
    expect(resolved.qmd?.embeddings.gemini?.model).toBe("gemini-embedding-001");
    expect(resolved.qmd?.embeddings.gemini?.batchSize).toBe(64);
    expect(resolved.qmd?.embeddings.gemini?.apiKey).toBe("gemini-test-key");
  });

  it("resolves Voyage embedding configuration", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          embeddings: {
            provider: "voyage",
            voyage: {
              apiKey: "voyage-test-key",
              model: "voyage-3-lite",
              batchSize: 256,
            },
          },
        },
      },
    };
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.embeddings.provider).toBe("voyage");
    expect(resolved.qmd?.embeddings.voyage?.model).toBe("voyage-3-lite");
    expect(resolved.qmd?.embeddings.voyage?.batchSize).toBe(256);
    expect(resolved.qmd?.embeddings.voyage?.apiKey).toBe("voyage-test-key");
  });

  it("uses default values for OpenAI when not specified", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          embeddings: {
            provider: "openai",
          },
        },
      },
    };
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.embeddings.provider).toBe("openai");
    expect(resolved.qmd?.embeddings.openai?.model).toBe("text-embedding-3-small");
    expect(resolved.qmd?.embeddings.openai?.baseUrl).toBe("https://api.openai.com/v1");
    expect(resolved.qmd?.embeddings.openai?.batchSize).toBe(100);
  });

  it("resolves API key from environment variable reference", () => {
    process.env.TEST_OPENAI_KEY = "from-env-var";
    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: "/tmp/memory-test" } },
      memory: {
        backend: "qmd",
        qmd: {
          embeddings: {
            provider: "openai",
            openai: {
              apiKey: "$TEST_OPENAI_KEY",
            },
          },
        },
      },
    };
    const resolved = resolveMemoryBackendConfig({ cfg, agentId: "main" });
    expect(resolved.qmd?.embeddings.openai?.apiKey).toBe("from-env-var");
    delete process.env.TEST_OPENAI_KEY;
  });
});
