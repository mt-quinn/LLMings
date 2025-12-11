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
  | "Barbarian"
  | "Wizard"
  | "Thief"
  | "Rogue"
  | "Druid"
  | "Paladin";

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
   // Two-word tag describing how they died (e.g. "red mist"), set after a fatal encounter.
  deathTag?: string | null;
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
  // Two-word description of death for failure cases (e.g. "red mist"), null for successes.
  deathTag?: string | null;
  // One-sentence description of how they died and in what context, used on the end-of-run summary screen.
  deathSummary?: string | null;
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
  // Chunky, bouncy, onomatopoeic LLMing names
  "Chunk",
  "Blocky",
  "Whumps",
  "Clogs",
  "Bloopy",
  "Oopsy",
  "Plonk",
  "Clatter",
  "Thwip",
  "Plink",
  "Bopple",
  "Snork",
  "Glomp",
  "Crinkle",
  "Squidge",
  "Blorp",
  "Thunk",
  "Muddle",
  "Skitter",
  "Plod",
  "Flump",
  "Boing",
  "Skronk",
  "Crumpet",
  "Tumbles",
  "Scuff",
  "Splat",
  "Rumple",
  "Doodle",
  "Fidget",
  "Wobble",
  "Snaggle",
  "Bumble",
  "Clonk",
  "Spronk",
  "Grumble",
  "Swizzle",
  "Jumble",
  "Smudge",
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
  "Barbarian",
  "Wizard",
  "Thief",
  "Rogue",
  "Druid",
  "Paladin",
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
      deathTag: null,
      history: [],
    });
  }

  return party;
}


