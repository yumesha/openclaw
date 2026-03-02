import type { ResolvedQmdEmbeddingsConfig } from "./backend-config.js";
import type { EmbeddingProvider as GenericEmbeddingProvider } from "./embeddings.js";

export interface QmdEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly provider: GenericEmbeddingProvider;

  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  health(): Promise<boolean>;
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

abstract class BaseEmbeddingProvider implements QmdEmbeddingProvider {
  abstract readonly name: string;
  abstract readonly dimensions: number;
  abstract readonly provider: GenericEmbeddingProvider;

  async embed(text: string): Promise<number[]> {
    if (!text.trim()) {
      return Array.from({ length: this.dimensions }).fill(0) as number[];
    }
    const results = await this.embedBatch([text]);
    return results[0] ?? (Array.from({ length: this.dimensions }).fill(0) as number[]);
  }

  abstract embedBatch(texts: string[]): Promise<number[][]>;

  async health(): Promise<boolean> {
    try {
      const result = await this.embed("test");
      return result.length === this.dimensions && result.some((v) => v !== 0);
    } catch {
      return false;
    }
  }
}

class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = "openai";
  readonly dimensions: number;
  readonly provider: GenericEmbeddingProvider;

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly batchSize: number;

  constructor(config: ResolvedQmdEmbeddingsConfig) {
    super();
    this.apiKey = config.openai?.apiKey;
    this.model = config.openai?.model ?? "text-embedding-3-small";
    this.baseUrl = (config.openai?.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.batchSize = config.openai?.batchSize ?? 100;
    this.dimensions = config.openai?.dimensions ?? this.inferDimensions(this.model);
    this.provider = this.createGenericProvider();
  }

  private inferDimensions(model: string): number {
    if (model.includes("large")) {
      return 3072;
    }
    if (model.includes("small")) {
      return 1536;
    }
    return 1536;
  }

  private createGenericProvider(): GenericEmbeddingProvider {
    return {
      id: "openai",
      model: this.model,
      maxInputTokens: 8192,
      embedQuery: (text) => this.embed(text),
      embedBatch: (texts) => this.embedBatch(texts),
    };
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResults = await this.embedSingleBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedSingleBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure apiKey.",
      );
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as EmbeddingResponse;

    if (data.error) {
      throw new Error(`OpenAI API error: ${data.error.message ?? "Unknown error"}`);
    }

    return (data.data ?? []).map(
      (item) => item.embedding ?? (Array.from({ length: this.dimensions }).fill(0) as number[]),
    );
  }
}

class GeminiEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = "gemini";
  readonly dimensions = 768;
  readonly provider: GenericEmbeddingProvider;

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly batchSize: number;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(config: ResolvedQmdEmbeddingsConfig) {
    super();
    this.apiKey = config.gemini?.apiKey;
    this.model = config.gemini?.model ?? "gemini-embedding-001";
    this.batchSize = config.gemini?.batchSize ?? 100;
    this.provider = this.createGenericProvider();
  }

  private createGenericProvider(): GenericEmbeddingProvider {
    return {
      id: "gemini",
      model: this.model,
      maxInputTokens: 2048,
      embedQuery: (text) => this.embed(text),
      embedBatch: (texts) => this.embedBatch(texts),
    };
  }

  async embed(text: string): Promise<number[]> {
    if (!text.trim()) {
      return Array.from({ length: this.dimensions }).fill(0) as number[];
    }

    if (!this.apiKey) {
      throw new Error(
        "Gemini API key not configured. Set GEMINI_API_KEY environment variable or configure apiKey.",
      );
    }

    const modelPath = this.model.startsWith("models/") ? this.model : `models/${this.model}`;
    const response = await fetch(`${this.baseUrl}/${modelPath}:embedContent?key=${this.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { embedding?: { values?: number[] } };
    return data.embedding?.values ?? (Array.from({ length: this.dimensions }).fill(0) as number[]);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResults = await this.embedSingleBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedSingleBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error(
        "Gemini API key not configured. Set GEMINI_API_KEY environment variable or configure apiKey.",
      );
    }

    const modelPath = this.model.startsWith("models/") ? this.model : `models/${this.model}`;
    const requests = texts.map((text) => ({
      model: modelPath,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
    }));

    const response = await fetch(
      `${this.baseUrl}/${modelPath}:batchEmbedContents?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
    return (data.embeddings ?? []).map(
      (item) => item.values ?? (Array.from({ length: this.dimensions }).fill(0) as number[]),
    );
  }
}

class VoyageEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = "voyage";
  readonly dimensions = 1024;
  readonly provider: GenericEmbeddingProvider;

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly batchSize: number;
  private readonly baseUrl = "https://api.voyageai.com/v1";

  constructor(config: ResolvedQmdEmbeddingsConfig) {
    super();
    this.apiKey = config.voyage?.apiKey;
    this.model = config.voyage?.model ?? "voyage-3-lite";
    this.batchSize = config.voyage?.batchSize ?? 128;
    this.provider = this.createGenericProvider();
  }

  private createGenericProvider(): GenericEmbeddingProvider {
    return {
      id: "voyage",
      model: this.model,
      maxInputTokens: 16000,
      embedQuery: (text) => this.embed(text),
      embedBatch: (texts) => this.embedBatch(texts),
    };
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResults = await this.embedSingleBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedSingleBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error(
        "Voyage API key not configured. Set VOYAGE_API_KEY environment variable or configure apiKey.",
      );
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: "document",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as EmbeddingResponse;

    if (data.error) {
      throw new Error(`Voyage API error: ${data.error.message ?? "Unknown error"}`);
    }

    return (data.data ?? []).map(
      (item) => item.embedding ?? (Array.from({ length: this.dimensions }).fill(0) as number[]),
    );
  }
}

class LocalEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = "local";
  readonly dimensions = 384;
  readonly provider: GenericEmbeddingProvider;

  constructor(_config: ResolvedQmdEmbeddingsConfig) {
    super();
    this.provider = this.createGenericProvider();
  }

  private createGenericProvider(): GenericEmbeddingProvider {
    return {
      id: "local",
      model: "local",
      maxInputTokens: 512,
      embedQuery: () => this.embed(""),
      embedBatch: () => Promise.resolve([]),
    };
  }

  async embed(_text: string): Promise<number[]> {
    throw new Error(
      "Local embeddings should be handled by qmd binary directly. This provider is a placeholder.",
    );
  }

  async embedBatch(_texts: string[]): Promise<number[][]> {
    throw new Error(
      "Local embeddings should be handled by qmd binary directly. This provider is a placeholder.",
    );
  }

  async health(): Promise<boolean> {
    return true;
  }
}

export function createQmdEmbeddingProvider(
  config: ResolvedQmdEmbeddingsConfig,
): QmdEmbeddingProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIEmbeddingProvider(config);
    case "gemini":
      return new GeminiEmbeddingProvider(config);
    case "voyage":
      return new VoyageEmbeddingProvider(config);
    case "local":
    default:
      return new LocalEmbeddingProvider(config);
  }
}

export function getEmbeddingDimensions(
  provider: QmdEmbeddingProvider["name"],
  model?: string,
): number {
  switch (provider) {
    case "openai":
      if (model?.includes("large")) {
        return 3072;
      }
      return 1536;
    case "gemini":
      return 768;
    case "voyage":
      return 1024;
    case "local":
    default:
      return 384;
  }
}
