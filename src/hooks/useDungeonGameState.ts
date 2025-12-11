"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionCard,
  EncounterResult,
  LLMing,
  Obstacle,
  generateParty,
} from "@/data/llmings";

export type GameMode = "daily" | "debug-random";

export type EncounterStatus = "pending" | "in_progress" | "resolved";

export type Encounter = {
  index: number;
  status: EncounterStatus;
  obstacle?: Obstacle;
  cards?: ActionCard[];
  result?: EncounterResult;
};

export type DungeonState = {
  mode: GameMode;
  dateKey: string; // YYYY-MM-DD for daily mode
  seed: string;
  party: LLMing[];
  encounters: Encounter[]; // always length 5
  currentEncounterIndex: number; // 0..5
};

const DAILY_STORAGE_KEY = "llmings-dungeon-v1";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyEncounters(): Encounter[] {
  return Array.from({ length: 5 }, (_, index) => ({
    index,
    status: "pending" as EncounterStatus,
  }));
}

function createNewDailyState(): DungeonState {
  const dateKey = todayKey();
  const seed = dateKey;
  const party = generateParty(seed, 5);
  return {
    mode: "daily",
    dateKey,
    seed,
    party,
    encounters: createEmptyEncounters(),
    currentEncounterIndex: 0,
  };
}

function createRandomDebugState(): DungeonState {
  const dateKey = todayKey();
  const seed = `${dateKey}-debug-${Math.random().toString(36).slice(2, 10)}`;
  const party = generateParty(seed, 5);
  return {
    mode: "debug-random",
    dateKey,
    seed,
    party,
    encounters: createEmptyEncounters(),
    currentEncounterIndex: 0,
  };
}

function reviveState(raw: unknown): DungeonState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as any;
  if (!Array.isArray(value.party) || !Array.isArray(value.encounters)) {
    return null;
  }
  const party: LLMing[] = (value.party as LLMing[]).map((p, idx) => {
    // Backwards-compatible revive for when characterClass and deathTag did not exist yet.
    const classes: LLMing["characterClass"][] = [
      "barbarian",
      "wizard",
      "thief",
      "rogue",
      "druid",
      "paladin",
    ];
    const fallbackClass = classes[idx % classes.length];
    return {
      ...p,
      characterClass: p.characterClass ?? fallbackClass,
      deathTag: p.deathTag ?? null,
    };
  });
  const encounters: Encounter[] = value.encounters.map(
    (e: any, idx: number) => ({
      index: typeof e.index === "number" ? e.index : idx,
      status: (e.status as EncounterStatus) || "pending",
      obstacle: e.obstacle,
      cards: e.cards,
      result: e.result,
    }),
  );

  return {
    mode: (value.mode as GameMode) || "daily",
    dateKey: typeof value.dateKey === "string" ? value.dateKey : todayKey(),
    seed: typeof value.seed === "string" ? value.seed : todayKey(),
    party,
    encounters,
    currentEncounterIndex:
      typeof value.currentEncounterIndex === "number"
        ? value.currentEncounterIndex
        : 0,
  };
}

export function useDungeonGameState() {
  const [state, setState] = useState<DungeonState | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(DAILY_STORAGE_KEY);
      if (stored) {
        const parsed = reviveState(JSON.parse(stored));
        if (
          parsed &&
          parsed.mode === "daily" &&
          parsed.dateKey === todayKey()
        ) {
          setState(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load LLMings state from localStorage", e);
    }

    setState(createNewDailyState());
  }, []);

  // Persist whenever state changes
  useEffect(() => {
    if (!state || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to persist LLMings state", e);
    }
  }, [state]);

  const isLoaded = !!state;

  const isComplete = useMemo(() => {
    if (!state) return false;
    return state.currentEncounterIndex >= state.encounters.length;
  }, [state]);

  const currentEncounter = useMemo(() => {
    if (!state) return null;
    if (state.currentEncounterIndex >= state.encounters.length) return null;
    return state.encounters[state.currentEncounterIndex];
  }, [state]);

  const survivors = useMemo(() => {
    if (!state) return 0;
    return state.party.filter((p) => p.alive).length;
  }, [state]);

  const totalEncounters = 5;

  const markObstacleGenerated = useCallback(
    (encounterIndex: number, obstacle: Obstacle) => {
      setState((prev) => {
        if (!prev) return prev;
        const encounters = prev.encounters.map((e, idx) =>
          idx === encounterIndex
            ? {
                ...e,
                obstacle,
                status: e.status === "pending" ? "in_progress" : e.status,
              }
            : e,
        );
        console.log("[LLMings] markObstacleGenerated", {
          encounterIndex,
          obstacle,
          encounters,
        });
        return { ...prev, encounters };
      });
    },
    [],
  );

  const setCardsForEncounter = useCallback(
    (encounterIndex: number, cards: ActionCard[]) => {
      setState((prev) => {
        if (!prev) return prev;
        const encounters = prev.encounters.map((e, idx) =>
          idx === encounterIndex ? { ...e, cards } : e,
        );
        return { ...prev, encounters };
      });
    },
    [],
  );

  const applyEncounterResult = useCallback(
    (encounterIndex: number, result: EncounterResult) => {
      setState((prev) => {
        if (!prev) return prev;

        const encounters = prev.encounters.map((e, idx) =>
          idx === encounterIndex
            ? {
                ...e,
                result,
                status: "resolved" as EncounterStatus,
              }
            : e,
        );

        const party = prev.party.map((member) => {
          if (member.id !== result.llmingId) return member;
          const historyEntry: LLMing["history"][number] = {
            obstacleIndex: result.obstacleIndex,
            obstacleTitle: encounters[encounterIndex].obstacle?.title ?? "",
            outcome: result.success ? "success" : "failure",
            cardSummary: result.card.summary,
          };
          const isFatal = !result.success;
          return {
            ...member,
            alive: isFatal ? false : member.alive,
            deathTag: isFatal ? result.deathTag ?? member.deathTag ?? null : member.deathTag ?? null,
            history: [...member.history, historyEntry],
          };
        });

        return {
          ...prev,
          encounters,
          party,
        };
      });
    },
    [],
  );

  const advanceEncounter = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const nextIndex = Math.min(
        prev.currentEncounterIndex + 1,
        prev.encounters.length,
      );
      return {
        ...prev,
        currentEncounterIndex: nextIndex,
      };
    });
  }, []);

  const resetEncounter = useCallback((encounterIndex: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const encounters = prev.encounters.map((e, idx) =>
        idx === encounterIndex
          ? {
              index: encounterIndex,
              status: "pending" as EncounterStatus,
            }
          : e,
      );
      return {
        ...prev,
        encounters,
        currentEncounterIndex: Math.min(
          encounterIndex,
          encounters.length,
        ),
        };
      });
    },
    [],
  );

  const resetDaily = useCallback(() => {
    setState(createNewDailyState());
  }, []);

  const forceRandomDebugRun = useCallback(() => {
    setState(createRandomDebugState());
  }, []);

  return {
    state,
    isLoaded,
    isComplete,
    currentEncounter,
    survivors,
    totalEncounters,
    markObstacleGenerated,
    setCardsForEncounter,
    applyEncounterResult,
    advanceEncounter,
    resetEncounter,
    resetDaily,
    forceRandomDebugRun,
  } as const;
}


