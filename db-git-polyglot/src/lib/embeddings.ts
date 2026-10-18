import crypto from 'crypto';

/**
 * Deterministically hashes words/tokens in `text` into a normalized 384-dimensional
 * float array and returns it formatted as a pgvector literal string "[0.0123, -0.0456, ...]"
 * so semantic search works 100% offline with zero external API keys.
 *
 * @param text Input text (e.g. commit message or search query)
 * @returns pgvector literal string
 */
export function generateTextEmbedding(text: string): string {
  const DIMENSIONS = 384;
  const vector = new Float64Array(DIMENSIONS);

  const cleanText = (text || '').trim().toLowerCase();
  if (!cleanText) {
    const uniformVal = (1 / Math.sqrt(DIMENSIONS)).toFixed(6);
    return `[${Array(DIMENSIONS).fill(uniformVal).join(', ')}]`;
  }

  // Tokenize into words / symbols
  const tokens = cleanText.match(/[a-z0-9_-]+/g) || [cleanText];

  // Deterministically project terms onto the vector dimensions
  const project = (term: string, weight: number) => {
    const hash = crypto.createHash('sha256').update(term).digest();
    let seed = hash.readUInt32BE(0);
    for (let i = 0; i < DIMENSIONS; i++) {
      // Linear congruential generator for reproducible pseudo-random projection
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const val = ((seed / 4294967296) * 2 - 1) * weight;
      vector[i] += val;
    }
  };

  // 1. Individual token projections
  for (const token of tokens) {
    project(token, 1.0);

    // Sub-word character trigrams for semantic/morphological overlap
    if (token.length > 3) {
      for (let i = 0; i <= token.length - 3; i++) {
        project(token.slice(i, i + 3), 0.3);
      }
    }
  }

  // 2. Full text sequence projection for global sentence context
  project(cleanText, 0.6);

  // 3. Compute Euclidean (L2) norm
  let sumSq = 0;
  for (let i = 0; i < DIMENSIONS; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);

  if (norm === 0) {
    const uniformVal = (1 / Math.sqrt(DIMENSIONS)).toFixed(6);
    return `[${Array(DIMENSIONS).fill(uniformVal).join(', ')}]`;
  }

  // 4. Normalize to unit vector and format as pgvector string
  const values: string[] = [];
  for (let i = 0; i < DIMENSIONS; i++) {
    values.push((vector[i] / norm).toFixed(6));
  }

  return `[${values.join(', ')}]`;
}
