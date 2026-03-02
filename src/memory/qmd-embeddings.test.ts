import { describe, expect, it } from "vitest";
import type { ResolvedQmdEmbeddingsConfig } from "./backend-config.js";
import { createQmdEmbeddingProvider, getEmbeddingDimensions } from "./qmd-embeddings.js";

describe("qmd-embeddings", () => {
  describe("createQmdEmbeddingProvider", () => {
    it("creates local provider by default", () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "local",
        local: {},
      };
      const provider = createQmdEmbeddingProvider(config);
      expect(provider.name).toBe("local");
      expect(provider.dimensions).toBe(384);
    });

    it("creates OpenAI provider with correct dimensions for small model", () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "openai",
        local: {},
        openai: {
          model: "text-embedding-3-small",
          baseUrl: "https://api.openai.com/v1",
          batchSize: 100,
          dimensions: 1536,
        },
      };
      const provider = createQmdEmbeddingProvider(config);
      expect(provider.name).toBe("openai");
      expect(provider.dimensions).toBe(1536);
    });

    it("creates OpenAI provider with correct dimensions for large model", () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "openai",
        local: {},
        openai: {
          model: "text-embedding-3-large",
          baseUrl: "https://api.openai.com/v1",
          batchSize: 100,
          dimensions: 3072,
        },
      };
      const provider = createQmdEmbeddingProvider(config);
      expect(provider.name).toBe("openai");
      expect(provider.dimensions).toBe(3072);
    });

    it("creates Gemini provider", () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "gemini",
        local: {},
        gemini: {
          model: "gemini-embedding-001",
          batchSize: 100,
        },
      };
      const provider = createQmdEmbeddingProvider(config);
      expect(provider.name).toBe("gemini");
      expect(provider.dimensions).toBe(768);
    });

    it("creates Voyage provider", () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "voyage",
        local: {},
        voyage: {
          model: "voyage-3-lite",
          batchSize: 128,
        },
      };
      const provider = createQmdEmbeddingProvider(config);
      expect(provider.name).toBe("voyage");
      expect(provider.dimensions).toBe(1024);
    });

    it("local provider throws when trying to embed", async () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "local",
        local: {},
      };
      const provider = createQmdEmbeddingProvider(config);
      await expect(provider.embed("test")).rejects.toThrow(
        "Local embeddings should be handled by qmd binary directly",
      );
    });

    it("local provider returns healthy status", async () => {
      const config: ResolvedQmdEmbeddingsConfig = {
        provider: "local",
        local: {},
      };
      const provider = createQmdEmbeddingProvider(config);
      const healthy = await provider.health();
      expect(healthy).toBe(true);
    });
  });

  describe("getEmbeddingDimensions", () => {
    it("returns correct dimensions for OpenAI small model", () => {
      expect(getEmbeddingDimensions("openai", "text-embedding-3-small")).toBe(1536);
    });

    it("returns correct dimensions for OpenAI large model", () => {
      expect(getEmbeddingDimensions("openai", "text-embedding-3-large")).toBe(3072);
    });

    it("returns default dimensions for OpenAI when model unspecified", () => {
      expect(getEmbeddingDimensions("openai")).toBe(1536);
    });

    it("returns correct dimensions for Gemini", () => {
      expect(getEmbeddingDimensions("gemini")).toBe(768);
    });

    it("returns correct dimensions for Voyage", () => {
      expect(getEmbeddingDimensions("voyage")).toBe(1024);
    });

    it("returns default dimensions for local", () => {
      expect(getEmbeddingDimensions("local")).toBe(384);
    });
  });
});
