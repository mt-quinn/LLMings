"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionCard,
  EncounterResult,
  LLMing,
  Obstacle,
} from "@/data/llmings";
import { useDungeonGameState } from "@/hooks/useDungeonGameState";

type ObstacleResponse = {
  obstacle: Obstacle;
};

type ObstaclesResponse = {
  obstacles: Obstacle[];
};

type CardsResponse = {
  cards: ActionCard[];
};

type ResolveResponse = {
  success: boolean;
  vignette: string;
  deathTag?: string | null;
  deathSummary?: string | null;
};

export function Game() {
  const {
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
  } = useDungeonGameState();

  const [loadingObstacle, setLoadingObstacle] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<EncounterResult | null>(null);
  const [currentObstacleOverride, setCurrentObstacleOverride] =
    useState<Obstacle | null>(null);
  const [debugRawObstacle, setDebugRawObstacle] = useState<string | null>(null);

  const isDebug = true;

  const livingParty: LLMing[] = useMemo(() => {
    if (!state) return [];
    return state.party.filter((p) => p.alive);
  }, [state]);

  const displayedObstacle =
    currentObstacleOverride ?? currentEncounter?.obstacle;

  console.log("[LLMings] Render state", {
    hasState: !!state,
    isLoaded,
    isComplete,
    currentEncounter,
    currentObstacleOverride,
    displayedObstacle,
  });

  // On first load, generate the full set of obstacles for the run in one call
  // so the model can ensure variety across all five.
  useEffect(() => {
    if (!state || isComplete) return;
    if (loadingObstacle) return;
    // If we already have at least one obstacle, assume the dungeon has been generated.
    const anyObstacle = state.encounters.some((e) => e.obstacle);
    if (anyObstacle) return;

    (async () => {
      try {
        setError(null);
        setLoadingObstacle(true);
        console.log("[LLMings] Requesting full obstacle set for dungeon run");

        const res = await fetch("/api/obstacles", {
          method: "POST",
        });

        const rawText = await res.text();
        console.log(
          "[LLMings] /api/obstacles raw response",
          res.status,
          rawText,
        );
        setDebugRawObstacle(rawText);

        if (!res.ok) {
          console.error(
            "[LLMings] /api/obstacles HTTP error",
            res.status,
            rawText,
          );
          throw new Error(
            `Failed to generate obstacles (${res.status}): ${rawText}`,
          );
        }

        let data: ObstaclesResponse | null = null;
        try {
          data = JSON.parse(rawText) as ObstaclesResponse;
        } catch (parseError) {
          console.error(
            "[LLMings] Failed to parse /api/obstacles JSON",
            parseError,
          );
          throw new Error(
            `Failed to parse obstacles JSON: ${(parseError as Error).message}`,
          );
        }

        if (!data?.obstacles || data.obstacles.length === 0) {
          throw new Error("Obstacles response missing 'obstacles' array");
        }

        // Map obstacles into the encounters by index; cap at available encounters.
        data.obstacles.forEach((obstacle, idx) => {
          if (!state.encounters[idx]) return;
          const withIndex: Obstacle = {
            ...obstacle,
            index: idx,
          };
          console.log("[LLMings] Applying generated obstacle to encounter", {
            idx,
            obstacle: withIndex,
          });
          markObstacleGenerated(idx, withIndex);
        });
      } catch (e) {
        console.error("Client dungeon obstacle set generation error:", e);
        setError(
          "Could not generate today's dungeon obstacles. Check the dev server logs for /api/obstacles errors.",
        );
      } finally {
        setLoadingObstacle(false);
      }
    })();
  }, [state, isComplete, loadingObstacle, markObstacleGenerated]);

  // Auto-generate the obstacle for the current encounter if, for some reason,
  // the full-dungeon generation did not populate it.
  useEffect(() => {
    if (!state || !currentEncounter || isComplete) return;
    // If we already have any obstacles at all, rely on the full-dungeon effect;
    // do not generate ad-hoc per-encounter obstacles in normal flow.
    const anyObstacle = state.encounters.some((e) => e.obstacle);
    if (anyObstacle) return;
    // If we already have an obstacle in either central state or local override,
    // don't re-request it.
    if (currentEncounter.obstacle || currentObstacleOverride || loadingObstacle)
      return;

    const encounterIndex = currentEncounter.index;

    (async () => {
      try {
        setError(null);
        setLoadingObstacle(true);
        console.log(
          "[LLMings] Requesting obstacle for encounter",
          encounterIndex,
        );

        const obstacleRes = await fetch("/api/obstacle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: encounterIndex,
          }),
        });

        const rawText = await obstacleRes.text();
        console.log(
          "[LLMings] /api/obstacle raw response",
          obstacleRes.status,
          rawText,
        );
        setDebugRawObstacle(rawText);

        let obstacleData: ObstacleResponse | null = null;
        if (obstacleRes.ok) {
          try {
            obstacleData = JSON.parse(rawText) as ObstacleResponse;
          } catch (parseError) {
            console.error(
              "[LLMings] Failed to parse /api/obstacle JSON",
              parseError,
            );
            throw new Error(
              `Failed to parse obstacle JSON: ${(parseError as Error).message}`,
            );
          }
        } else {
          console.error(
            "[LLMings] /api/obstacle HTTP error",
            obstacleRes.status,
            rawText,
          );
          throw new Error(
            `Failed to generate obstacle (${obstacleRes.status}): ${rawText}`,
          );
        }

        if (obstacleData?.obstacle) {
          console.log("[LLMings] Received obstacle:", obstacleData.obstacle);
          // Store in local UI state immediately so we can render even if
          // central game state wiring is off.
          setCurrentObstacleOverride(obstacleData.obstacle);
          markObstacleGenerated(encounterIndex, obstacleData.obstacle);
        } else {
          throw new Error("Obstacle response missing 'obstacle' field");
        }
      } catch (e) {
        console.error("Client obstacle generation error:", e);
        setError(
          "Could not generate this obstacle. Check the dev server logs for /api/obstacle errors.",
        );
      } finally {
        setLoadingObstacle(false);
      }
    })();
  }, [
    state,
    currentEncounter,
    isComplete,
    loadingObstacle,
    currentObstacleOverride,
    markObstacleGenerated,
  ]);

  // Once an obstacle exists, generate cards for it.
  useEffect(() => {
    if (!state || !currentEncounter || isComplete) return;
    if (loadingCards) return;
    // If this encounter already has cards, don't re-request.
    if (currentEncounter.cards && currentEncounter.cards.length > 0) return;
    const obstacle =
      currentObstacleOverride ?? currentEncounter.obstacle ?? undefined;
    if (!obstacle) return;

    const encounterIndex = currentEncounter.index;

    (async () => {
      try {
        setLoadingCards(true);
        console.log("[LLMings] Requesting cards for encounter", obstacle);

        const cardsRes = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            obstacle,
            party: livingParty,
          }),
        });

        const rawText = await cardsRes.text();
        console.log(
          "[LLMings] /api/cards raw response",
          cardsRes.status,
          rawText,
        );

        let cardsData: CardsResponse | null = null;
        if (cardsRes.ok) {
          try {
            cardsData = JSON.parse(rawText) as CardsResponse;
          } catch (parseError) {
            console.error(
              "[LLMings] Failed to parse /api/cards JSON",
              parseError,
            );
            throw new Error(
              `Failed to parse cards JSON: ${(parseError as Error).message}`,
            );
          }
        } else {
          console.error(
            "[LLMings] /api/cards HTTP error",
            cardsRes.status,
            rawText,
          );
          throw new Error(
            `Failed to generate action cards (${cardsRes.status}): ${rawText}`,
          );
        }

        if (cardsData?.cards) {
          console.log("[LLMings] Received cards:", cardsData.cards);
          setCardsForEncounter(encounterIndex, cardsData.cards);
        } else {
          throw new Error("Cards response missing 'cards' field");
        }
      } catch (e) {
        console.error("Client card generation error:", e);
        setError(
          "Could not generate action cards. Check the dev server logs for /api/cards errors.",
        );
      } finally {
        setLoadingCards(false);
      }
    })();
  }, [
    state,
    currentEncounter,
    isComplete,
    loadingCards,
    currentObstacleOverride,
    livingParty,
    setCardsForEncounter,
  ]);

  const handleRetryGeneration = async () => {
    if (!state || !currentEncounter || isComplete) return;
    // Reset this encounter and let the effect re-run.
    setError(null);
    setCurrentObstacleOverride(null);
    resetEncounter(currentEncounter.index);
  };

  const handleCardChosen = async (card: ActionCard) => {
    if (!state || !currentEncounter || resolving || isComplete) return;
    const obstacle = currentEncounter.obstacle;
    if (!obstacle) return;

    try {
      setResolving(true);
      setError(null);

      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obstacle,
          card,
          partyMember: state.party.find((p) => p.id === card.llmingId),
          partyHistory: state.party.map((p) => ({
            id: p.id,
            name: p.name,
            history: p.history,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to resolve outcome");
      }

      const data = (await res.json()) as ResolveResponse;
      const success = !!data.success;
      const vignette = data.vignette;

      const result: EncounterResult = {
        obstacleIndex: currentEncounter.index,
        llmingId: card.llmingId,
        card,
        success,
        vignette,
        deathTag: !success ? data.deathTag ?? null : null,
        deathSummary: !success ? data.deathSummary ?? null : null,
      };

      applyEncounterResult(currentEncounter.index, result);
      setLastResult(result);
    } catch (e) {
      console.error(e);
      setError("The replay booth stalled. Try that choice again.");
    } finally {
      setResolving(false);
    }
  };

  const handleNextEncounter = () => {
    if (!state) return;
    setError(null);
    setLastResult(null);
    setCurrentObstacleOverride(null);
    advanceEncounter();
  };

  if (!isLoaded || !state) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-llm-muted text-sm tracking-[0.25em] uppercase">
            LLMings
          </div>
          <div className="text-lg font-semibold">
            Gathering today&apos;s adventuring party…
          </div>
        </div>
      </div>
    );
  }

  const encounterNumber = currentEncounter
    ? currentEncounter.index + 1
    : totalEncounters;

  return (
    <div className="h-full flex flex-col">
      {isDebug && (
        <div className="px-3 pt-2 pb-1 text-[0.6rem] text-llm-muted flex items-center justify-between gap-2 bg-black/30 border-b border-llm-border/60">
          <span className="uppercase tracking-[0.2em]">Debug</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={resetDaily}
              className="rounded-full border border-llm-border px-2 py-0.5 bg-llm-panel hover:bg-llm-panel-soft transition text-[0.6rem]"
            >
              Reset daily
            </button>
            <button
              type="button"
              onClick={forceRandomDebugRun}
              className="rounded-full border border-llm-accent/40 px-2 py-0.5 bg-llm-panel hover:bg-llm-panel-soft transition text-[0.6rem]"
            >
              Random run
            </button>
          </div>
          {debugRawObstacle && (
            <span className="ml-2 max-w-[10rem] truncate text-[0.55rem] text-llm-muted">
              {debugRawObstacle}
            </span>
          )}
        </div>
      )}

      <header className="px-4 pt-2 pb-2 border-b border-llm-border/60 bg-llm-panel-soft/90">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[0.6rem] tracking-[0.35em] uppercase text-llm-muted">
              Daily Dungeon
            </div>
            <div className="font-display text-xl sm:text-2xl text-llm-accent tracking-wide drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
              LLMings
            </div>
          </div>
          <div className="text-right text-[0.7rem] leading-tight">
            <div className="text-llm-muted">Survivors</div>
            <div className="font-semibold text-llm-accent-alt text-sm">
              {survivors} / {state.party.length}
            </div>
            <div className="mt-0.5 text-[0.65rem] text-llm-muted">
              Obstacle {Math.min(encounterNumber, totalEncounters)} of{" "}
              {totalEncounters}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col px-3 pb-3 pt-2 gap-2 overflow-y-auto">
        <PartyStrip party={state.party} />

        {error && (
          <div className="rounded-xl border border-llm-danger/70 bg-llm-panel-soft/90 px-3 py-2 text-[0.8rem] text-llm-text flex items-start justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={handleRetryGeneration}
              className="shrink-0 text-[0.75rem] font-semibold text-llm-accent underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {!isComplete && currentEncounter && (
          <>
            <ObstaclePanel
              encounterIndex={currentEncounter.index}
              obstacle={displayedObstacle}
              loading={loadingObstacle}
            />

            {currentEncounter.result ? (
              <>
                <OutcomeLog
                  result={currentEncounter.result}
                  party={state.party}
                />
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleNextEncounter}
                    className="w-full inline-flex items-center justify-center rounded-full bg-gradient-to-r from-llm-accent-strong to-llm-accent-alt px-4 py-2 text-sm font-semibold text-black shadow-llm-glow"
                  >
                    {state.currentEncounterIndex >= totalEncounters - 1
                      ? "See final tally"
                      : "Next obstacle"}
                  </button>
                </div>
              </>
            ) : (
              <CardsPanel
                cards={currentEncounter.cards}
                party={state.party}
                loading={loadingCards}
                resolving={resolving}
                onCardChosen={handleCardChosen}
              />
            )}
          </>
        )}

        {isComplete && (
          <EndScreen
            survivors={survivors}
            party={state.party}
            encounters={state.encounters}
          />
        )}
      </div>
    </div>
  );
}

function PartyStrip({ party }: { party: LLMing[] }) {
  return (
    <section className="rounded-2xl border border-llm-border/70 bg-black/30 px-3 py-2 flex flex-col gap-1.5">
      <div className="text-[0.7rem] tracking-[0.25em] uppercase text-llm-muted">
        Party
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {party.map((p) => (
          <div
            key={p.id}
            className={`min-w-[4.2rem] rounded-xl border px-2 py-1.5 text-[0.7rem] flex flex-col gap-0.5 ${
              p.alive
                ? "border-llm-accent/50 bg-llm-panel-soft/80"
                : "border-llm-border/60 bg-black/40 opacity-70"
            }`}
          >
            <div className="font-semibold truncate">{p.name}</div>
            <div className="text-[0.6rem] text-llm-muted">
              {p.personality} · {p.characterClass}
            </div>
            {!p.alive && (
              <div className="text-[0.6rem] text-llm-danger">
                {p.deathTag ?? "fallen soul"}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ObstaclePanel(props: {
  encounterIndex: number;
  obstacle?: Obstacle;
  loading: boolean;
}) {
  const { encounterIndex, obstacle, loading } = props;

  return (
    <section className="rounded-2xl border border-llm-border/70 bg-llm-panel-soft/90 px-3 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.7rem] tracking-[0.25em] uppercase text-llm-muted">
          Obstacle {encounterIndex + 1}
        </div>
        {loading && (
          <div className="text-[0.7rem] text-llm-muted">Summoning…</div>
        )}
      </div>
      {obstacle ? (
        <>
          <div className="font-semibold text-[0.95rem] text-llm-accent">
            {obstacle.title}
          </div>
          <div className="text-[0.85rem] text-llm-text/90">
            {obstacle.description}
          </div>
        </>
      ) : (
        <div className="text-[0.85rem] text-llm-muted">
          Consulting the dungeon architect for today&apos;s complication…
        </div>
      )}
    </section>
  );
}

function CardsPanel(props: {
  cards?: ActionCard[];
  party: LLMing[];
  loading: boolean;
  resolving: boolean;
  onCardChosen: (card: ActionCard) => void;
}) {
  const { cards, party, loading, resolving, onCardChosen } = props;

  if (loading) {
    return (
      <section className="rounded-2xl border border-llm-border/70 bg-black/30 px-3 py-3 text-[0.85rem] text-llm-muted">
        Each LLMing is whispering ideas into the void…
      </section>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <section className="rounded-2xl border border-llm-border/70 bg-black/30 px-3 py-3 text-[0.85rem] text-llm-muted">
        Waiting for the party to draw their action cards…
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-llm-border/70 bg-black/40 px-3 py-3 flex flex-col gap-2">
      <div className="text-[0.7rem] tracking-[0.25em] uppercase text-llm-muted mb-1">
        Choose one plan
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((card, idx) => {
          const owner = party.find((p) => p.id === card.llmingId);
          return (
            <button
              key={`${card.llmingId}-${idx}`}
              type="button"
              onClick={() => onCardChosen(card)}
              disabled={resolving}
              className="text-left rounded-2xl border border-llm-border/70 bg-llm-panel-soft/90 px-3 py-2.5 text-[0.85rem] hover:bg-llm-panel/80 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center rounded-full bg-black/40 border border-llm-border/80 px-2 py-0.5 text-[0.7rem] text-llm-accent-alt">
                    {owner?.name ?? "Unknown"}
                  </span>
                  {owner && (
                    <span className="text-[0.65rem] text-llm-muted">
                      {owner.personality} · {owner.characterClass}
                    </span>
                  )}
                </div>
              </div>
              <div className="font-semibold text-llm-text mb-0.5">
                {card.summary}
              </div>
              {card.detail && (
                <div className="text-[0.8rem] text-llm-muted">{card.detail}</div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OutcomeLog(props: { result: EncounterResult; party: LLMing[] }) {
  const { result, party } = props;
  const member = party.find((p) => p.id === result.llmingId);
  const title = result.success ? "Success" : "Failure";

  return (
    <section className="rounded-2xl border border-llm-border/70 bg-llm-panel-soft/95 px-3 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.7rem] tracking-[0.25em] uppercase text-llm-muted">
          Outcome
        </div>
        <div
          className={`text-[0.7rem] font-semibold ${
            result.success ? "text-llm-accent-alt" : "text-llm-danger"
          }`}
        >
          {title}
        </div>
      </div>
      {member && (
        <div className="text-[0.8rem] text-llm-muted">
          {member.name} attempted:{" "}
          <span className="font-semibold text-llm-text">
            {result.card.summary}
          </span>
        </div>
      )}
      <div className="text-[0.85rem] text-llm-text whitespace-pre-wrap">
        {result.vignette}
      </div>
    </section>
  );
}

function EndScreen(props: {
  survivors: number;
  party: LLMing[];
  encounters: { index: number; result?: EncounterResult }[];
}) {
  const { survivors, party, encounters } = props;

  return (
    <section className="mt-1 rounded-2xl border border-llm-border/80 bg-llm-panel-soft/95 px-4 py-3 space-y-3">
      <div className="text-[0.7rem] tracking-[0.25em] uppercase text-llm-muted">
        Run complete
      </div>
      <div className="text-lg font-semibold">
        {survivors}{" "}
        <span className="text-llm-accent-alt">
          LLMing{survivors === 1 ? "" : "s"}
        </span>{" "}
        survived the dungeon.
      </div>
      <div className="text-[0.85rem] text-llm-muted">
        Scroll to review who made it through, who fell, and how the story went
        sideways.
      </div>

      <div className="space-y-2 mt-1">
        {party.map((p) => {
          const deathEntry = encounters.find(
            (e) => e.result && e.result.llmingId === p.id && !e.result.success,
          )?.result;

          return (
            <div
              key={p.id}
              className="rounded-2xl border border-llm-border/70 bg-black/35 px-3 py-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-semibold text-[0.95rem] text-llm-text">
                    {p.name}
                  </span>
                  <span className="text-[0.7rem] text-llm-muted">
                    {p.personality} · {p.characterClass}
                  </span>
                </div>
                <div
                  className={`text-[0.7rem] font-semibold ${
                    p.alive ? "text-llm-accent-alt" : "text-llm-danger"
                  }`}
                >
                  {p.alive ? "Survived" : p.deathTag ?? "Fallen"}
                </div>
              </div>
              {deathEntry && (
                <div className="text-[0.8rem] text-llm-text whitespace-pre-wrap">
                  {deathEntry.deathSummary ?? deathEntry.vignette}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


