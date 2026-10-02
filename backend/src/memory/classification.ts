import type { MemoryType } from "./types.js";

interface ClassificationRule {
  type: MemoryType;
  patterns: RegExp[];
  boost: number;
}

const RULES: ClassificationRule[] = [
  {
    type: "preference",
    patterns: [
      /\b(like|likes|love|loves|prefer|prefers|favorite|favourite|hate|hates|enjoy|enjoys)\b/i,
      /\b(любит|нравится|предпочитает|ненавидит|обожает)\b/i,
    ],
    boost: 0.15,
  },
  {
    type: "relationship",
    patterns: [
      /\b(friend|brother|sister|mother|father|wife|husband|partner|rival|mentor|ally)\b/i,
      /\b(друг|брат|сестра|мать|отец|жена|муж|партн[её]р|враг|союзник)\b/i,
    ],
    boost: 0.1,
  },
  {
    type: "character_state",
    patterns: [
      /\b(feel(?:s|ing)?|mood|afraid|angry|happy|sad|tired|wounded|injured|currently)\b/i,
      /\b(чувствует|настроен|устал|ранен|боит(?:ся)?|сейчас)\b/i,
    ],
    boost: 0.1,
  },
  {
    type: "important_event",
    patterns: [
      /\b(died|death|killed|married|destroyed|crowned|betrayed|war|catastrophe)\b/i,
      /\b(умер|убит|свадьб|разруш|коронован|предател|войн|катастроф)\b/i,
    ],
    boost: 0.25,
  },
  {
    type: "event",
    patterns: [
      /\b(yesterday|today|tomorrow|went|happened|arrived|left|met|fought)\b/i,
      /\b(вчера|сегодня|завтра|пош[её]л|случилось|прибыл|встретил|сразил)\b/i,
    ],
    boost: 0.05,
  },
  {
    type: "world_information",
    patterns: [
      /\b(kingdom|city|village|located|capital|region|world|realm|map)\b/i,
      /\b(королевств|город|деревн|столиц|регион|мир|царств)\b/i,
    ],
    boost: 0.1,
  },
  {
    type: "fact",
    patterns: [/\b(is|are|was|were|has|have|owns|named|called)\b/i, /\b(является|имеет|зов[уё]т|называется)\b/i],
    boost: 0,
  },
];

export interface ClassificationResult {
  type: MemoryType;
  confidenceBoost: number;
}

export function classifyMemory(content: string): ClassificationResult {
  let best: ClassificationResult = { type: "fact", confidenceBoost: 0 };

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(content))) {
      if (rule.boost >= best.confidenceBoost || best.type === "fact") {
        best = { type: rule.type, confidenceBoost: rule.boost };
        // important_event wins over weaker matches
        if (rule.type === "important_event") {
          return best;
        }
      }
    }
  }

  return best;
}
