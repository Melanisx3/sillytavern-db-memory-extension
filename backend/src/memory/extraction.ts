import { classifyMemory } from "./classification.js";
import { scoreConfidence, scoreImportance } from "./importance.js";
import { preprocessText, segmentCandidates } from "./preprocessing.js";
import type { ExtractedCandidate } from "./types.js";

const NOISE = /^(ok|okay|yes|no|yeah|sure|thanks|hello|hi|hey|lol)\.?$/i;

/**
 * Message → Preprocessing → Extraction → Classification → Importance/Confidence
 */
export function extractMemoryCandidates(
  rawContent: string,
  role: "user" | "assistant" | "system" = "user"
): ExtractedCandidate[] {
  const text = preprocessText(rawContent);
  if (!text || NOISE.test(text)) {
    return [];
  }

  const segments = segmentCandidates(text);
  const candidates: ExtractedCandidate[] = [];

  for (const segment of segments) {
    if (NOISE.test(segment) || segment.split(/\s+/).length < 3) {
      continue;
    }

    const classification = classifyMemory(segment);
    const importance = scoreImportance(classification.type, segment, classification.confidenceBoost);
    const confidence = scoreConfidence(segment, classification.confidenceBoost, role);

    // Drop low-signal noise
    if (importance < 0.35 && confidence < 0.45) {
      continue;
    }

    candidates.push({
      content: segment,
      type: classification.type,
      importance,
      confidence,
    });
  }

  return candidates;
}
