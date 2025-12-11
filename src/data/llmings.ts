// Core data + utilities for generating LLMings and dungeon structure.

export type Personality =
  | "Reckless"
  | "Nervous"
  | "Analytical"
  | "Dramatic"
  | "Deadpan"
  | "Chaotic"
  | "Heroic"
  | "Naive"
  | "Disgruntled";

export type Trait =
  | "Brave"
  | "Cowardly"
  | "Precise"
  | "Chaotic"
  | "Lucky";

export type CharacterClass =
  | "barbarian"
  | "wizard"
  | "thief"
  | "rogue"
  | "druid"
  | "paladin";

export type VoiceStyle =
  | "excitable stage directions"
  | "overwritten fantasy prose"
  | "dry technical commentary"
  | "deadpan one-liners"
  | "dramatic internal monologue";

export type LLMing = {
  id: number;
  name: string;
  personality: Personality;
  trait: Trait;
  characterClass: CharacterClass;
  voice: VoiceStyle;
  alive: boolean;
  history: LLMingHistoryEntry[];
};

export type LLMingHistoryEntry = {
  obstacleIndex: number;
  obstacleTitle: string;
  outcome: "success" | "failure";
  cardSummary: string;
};

export type Obstacle = {
  index: number;
  title: string;
  description: string;
  kind: "trap" | "monster" | "hazard" | "puzzle" | "weird";
};

export type ActionCard = {
  llmingId: number;
  summary: string;
  detail?: string;
};

export type EncounterResult = {
  obstacleIndex: number;
  llmingId: number;
  card: ActionCard;
  success: boolean;
  vignette: string;
};

// Simple deterministic RNG so that daily runs are stable per date key.
function makeRng(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 0xffffffff;
  };
}

const NAME_POOL = [
  "Jori",
  "Ellu",
  "Pip",
  "Ralla",
  "Brindle",
  "Merrit",
  "Kess",
  "Vex",
  "Loam",
  "Nyra",
  "Tamble",
  "Grym",
];

const PERSONALITIES: Personality[] = [
  "Reckless",
  "Nervous",
  "Analytical",
  "Dramatic",
  "Deadpan",
  "Chaotic",
  "Heroic",
  "Naive",
  "Disgruntled",
];

const TRAITS: Trait[] = ["Brave", "Cowardly", "Precise", "Chaotic", "Lucky"];

const CLASSES: CharacterClass[] = [
  "barbarian",
  "wizard",
  "thief",
  "rogue",
  "druid",
  "paladin",
];

const VOICES: VoiceStyle[] = [
  "excitable stage directions",
  "overwritten fantasy prose",
  "dry technical commentary",
  "deadpan one-liners",
  "dramatic internal monologue",
];

export function generateParty(seed: string, count: number): LLMing[] {
  const rng = makeRng(seed);
  const availableNames = [...NAME_POOL];

  const party: LLMing[] = [];
  for (let i = 0; i < count; i++) {
    const nameIndex = Math.floor(rng() * availableNames.length);
    const name = availableNames.splice(nameIndex, 1)[0] ?? `LLMing-${i + 1}`;

    const personality =
      PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)];
    const trait = TRAITS[Math.floor(rng() * TRAITS.length)];
    const characterClass = CLASSES[Math.floor(rng() * CLASSES.length)];
    const voice = VOICES[Math.floor(rng() * VOICES.length)];

    party.push({
      id: i,
      name,
      personality,
      trait,
      characterClass,
      voice,
      alive: true,
      history: [],
    });
  }

  return party;
}


