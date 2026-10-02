import type { MemoryType } from "./types.js";

const TYPE_BASE_IMPORTANCE: Record<MemoryType, number> = {
  fact: 0.45,
  preference: 0.6,
  event: 0.5,
  relationship: 0.7,
  character_state: 0.55,
  world_information: 0.5,
  important_event: 0.9,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreImportance(type: MemoryType, content: string, confidenceBoost = 0): number {
  let score = TYPE_BASE_IMPORTANCE[type];

  if (/\b(always|never|critical|vital|must|ключев|важен|всегда|никогда)\b/i.test(content)) {
    score += 0.15;
  }
  if (content.length > 160) {
    score += 0.05;
  }

  return clamp01(score + confidenceBoost * 0.3);
}

export function scoreConfidence(
  content: string,
  classificationBoost: number,
  role: "user" | "assistant" | "system" = "user"
): number {
  let score = 0.55 + classificationBoost;

  if (role === "user") {
    score += 0.1;
  } else if (role === "system") {
    score += 0.05;
  }

  if (/\b(maybe|perhaps|might|possibly|кажется|возможно|наверное)\b/i.test(content)) {
    score -= 0.2;
  }
  if (/\b(definitely|clearly|confirmed|точно|определ[её]нно)\b/i.test(content)) {
    score += 0.15;
  }

  return clamp01(score);
}
