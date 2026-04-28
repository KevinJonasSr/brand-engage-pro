/**
 * Public surface of the embeddings module.
 * Always import from "@/lib/embeddings".
 */

export {
  EMBED_MODEL,
  EMBED_DIMS,
  EmbeddingError,
  embedText,
  embedBatch,
  embedBatchWithIndex,
  normalizeForEmbedding,
  pgvectorLiteral,
} from "./client";

export {
  SOURCES,
  SOURCE_TABLES,
  type SourceTable,
  type Visibility,
  type SourceDescriptor,
  slugToSourceId,
  contentHash,
} from "./sources";

export {
  indexRow,
  indexRowAsync,
  type IndexResult,
} from "./index-row";
