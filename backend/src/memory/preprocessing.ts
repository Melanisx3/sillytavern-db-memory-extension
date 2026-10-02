/**
 * Normalize raw message text before memory extraction.
 */
export function preprocessText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split into candidate memory units (sentences / short clauses).
 */
export function segmentCandidates(text: string): string[] {
  const normalized = preprocessText(text);
  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);

  return parts.length > 0 ? parts : [normalized];
}
