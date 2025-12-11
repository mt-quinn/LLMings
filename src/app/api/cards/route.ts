import { NextResponse } from "next/server";
import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { ActionCard, LLMing, Obstacle } from "@/data/llmings";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      obstacle?: Obstacle;
      party?: LLMing[];
    };

    const { obstacle, party } = body;

    if (!obstacle || !party || !Array.isArray(party)) {
      return NextResponse.json(
        { error: "Missing obstacle or party" },
        { status: 400 },
      );
    }

    const living = party.filter((p) => p.alive);
    if (living.length === 0) {
      return NextResponse.json({ cards: [] });
    }

    const openai = getOpenAIClient();
    const prompt = buildCardsPrompt(obstacle, living);

    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL_ID,
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
      max_completion_tokens: 260,
      reasoning_effort:
        DEFAULT_MODEL_ID === "gpt-5.1-2025-11-13" ? ("none" as any) : "minimal",
      verbosity: "low",
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    console.log("[LLMings] /api/cards raw LLM content:", raw);

    let cards: ActionCard[];
    try {
      cards = parseCardsResponse(raw, living);
    } catch (parseError) {
      console.error(
        "Error parsing LLM cards content in /api/cards:",
        parseError,
        "raw:",
        raw,
      );
      return NextResponse.json(
        {
          error: "Failed to parse cards from model",
          details:
            parseError instanceof Error ? parseError.message : "Unknown parse error",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("Error in /api/cards:", error);
    return NextResponse.json(
      { error: "Failed to generate cards" },
      { status: 500 },
    );
  }
}

function buildCardsPrompt(obstacle: Obstacle, party: LLMing[]): string {
  const partySummary = party
    .map((p) => {
      const last = p.history[p.history.length - 1];
      const historyNote = last
        ? `Last time they ${last.outcome === "success" ? "succeeded" : "died"} attempting "${last.cardSummary}" at obstacle ${last.obstacleIndex + 1}.`
        : "They have no prior attempts yet.";
      return `- ${p.name} (${p.personality} ${p.characterClass}, trait: ${p.trait}; voice: ${p.voice}) — ${historyNote}`;
    })
    .join("\n");

  return `You are the card designer for a playful fantasy dungeon crawler.

Each living party member must propose exactly ONE action card for the current obstacle.

Obstacle:
- Title: ${obstacle.title}
- Kind: ${obstacle.kind}
- Description: ${obstacle.description}

Party:
${partySummary}

Rules for the cards:
- Each card is a short, evocative action summary, written as if the character is pitching the idea.
- The *type* of idea should be driven primarily by their CLASS:
  - barbarians favor direct, physical, smash-or-charge style actions.
  - wizards use spells, runes, illusions, or arcane tricks.
  - thieves/rogues lean on stealth, sabotage, traps, and nimble maneuvers.
  - druids call on nature, animals, plants, or shapeshifting.
  - paladins protect, shield, bless, or confront with righteous bravado.
- Personality and trait should mostly affect the *tone and riskiness* of the action, not its fundamental class-based style.
- Ideas can be clever, ridiculous, or risky, but they should plausibly interact with the obstacle.
- Keep each summary to a maximum of FIVE words (1–5 words), describing a simple action, object, or action+object combo.
- Do NOT include any detail text; only the five-word summary.
- Do NOT use the template "X improvises something Y at the obstacle."; instead, make each summary a concrete, specific action in that character's voice.

Output format (no extra text, no bullets, no JSON, no code fences):
- Return EXACTLY one line per living party member, in this order:
  0: <llmingId>|<summary>
  1: <llmingId>|<summary>
  etc.
- <llmingId> must be the numeric id from the Party list above.

Example (format only):
0|Slide across on shield
1|Poke tiles with broken spear`.trim();
}

function parseCardsResponse(raw: string, party: LLMing[]): ActionCard[] {
  // Strip any accidental code fences or surrounding markup.
  const cleanedRaw = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();

  const lines = cleanedRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error("No lines found in model cards output");
  }

  const cards: ActionCard[] = [];

  for (const line of lines) {
    // Remove any accidental leading bullets or numbering.
    const normalized = line.replace(/^[*-]\s*/, "");
    const parts = normalized.split("|");
    if (parts.length < 2) {
      continue;
    }

    const idPart = parts[0].trim();
    const summaryPart = parts[1].trim();

    const llmingId = Number(idPart);
    if (!Number.isFinite(llmingId)) {
      continue;
    }
    if (!summaryPart) {
      continue;
    }

    cards.push({
      llmingId,
      summary: summaryPart,
    });
  }

  if (cards.length === 0) {
    throw new Error("Could not parse any valid cards from model output");
  }

  // As a final safety check, ensure we only keep cards for living party members.
  const livingIds = new Set(party.filter((p) => p.alive).map((p) => p.id));
  const filtered = cards.filter((c) => livingIds.has(c.llmingId));

  if (filtered.length === 0) {
    throw new Error("Parsed cards, but none matched living party member ids");
  }

  return filtered;
}


