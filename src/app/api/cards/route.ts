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

    // New strategy: generate one card per living LLMing, with a dedicated
    // prompt per character. This guarantees that the game logic always
    // produces exactly one card per survivor, independent of how the model
    // behaves when asked for multiple cards at once.
    const cards: ActionCard[] = [];

    for (const member of living) {
      const prompt = buildSingleCardPrompt(obstacle, member);

      const response = await openai.chat.completions.create({
        model: DEFAULT_MODEL_ID,
        messages: [
          {
            role: "system",
            content: prompt,
          },
        ],
        max_completion_tokens: 60,
        reasoning_effort:
          DEFAULT_MODEL_ID === "gpt-5.1-2025-11-13" ? ("none" as any) : "minimal",
        verbosity: "low",
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? "";
      console.log(
        "[LLMings] /api/cards per-member raw LLM content:",
        { id: member.id, name: member.name },
        raw,
      );

      try {
        const card = parseSingleCardResponse(raw, member);
        cards.push(card);
      } catch (parseError) {
        console.error(
          "[LLMings] Failed to parse single card for member",
          { id: member.id, name: member.name },
          parseError,
          "raw:",
          raw,
        );
        // If parsing fails for an individual member, we surface that failure
        // rather than silently fabricating a fallback.
        return NextResponse.json(
          {
            error: "Failed to parse card from model for member",
            details:
              parseError instanceof Error
                ? parseError.message
                : "Unknown parse error",
          },
          { status: 500 },
        );
      }
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

function buildSingleCardPrompt(obstacle: Obstacle, member: LLMing): string {
  const last = member.history[member.history.length - 1];
  const historyNote = last
    ? `Last time you ${last.outcome === "success" ? "succeeded" : "died"} attempting "${last.cardSummary}" at obstacle ${
        last.obstacleIndex + 1
      }.`
    : "You have no prior attempts yet in this run.";

  return `You are a single adventurer in a lighthearted fantasy dungeon crawler.

Your job is to propose ONE action card idea for how YOU will try to handle the current obstacle.

You are:
- Name: ${member.name}
- Personality: ${member.personality}
- Class: ${member.characterClass}
- Trait: ${member.trait}
- Voice: ${member.voice}
- Recent history: ${historyNote}

Obstacle:
- Title: ${obstacle.title}
- Kind: ${obstacle.kind}
- Description: ${obstacle.description}

Rules for your card idea:
- The *style* of the idea must be driven primarily by your CLASS:
  - barbarians favor direct, physical, smash-or-charge style actions.
  - wizards use spells, runes, illusions, or arcane tricks.
  - thieves/rogues lean on stealth, sabotage, traps, and nimble maneuvers.
  - druids call on nature, animals, plants, or shapeshifting.
  - paladins protect, shield, bless, or confront with righteous bravado.
- Your personality and trait should mostly affect the *tone and riskiness* of the action, not its fundamental class-based style.
- The idea must plausibly interact with the obstacle as described.
- Keep the action summary extremely short and punchy: 1–5 words, describing a simple action, object, or action+object combo.
- Do NOT explain your reasoning.
- Do NOT include any detail text, narration, or justification.
- Do NOT use the template "X improvises something Y at the obstacle."; instead, make the summary a concrete, specific action in your voice.

Output format (no extra text, no bullets, no JSON, no code fences):
- Respond with ONLY your 1–5 word action summary, nothing else.`
    .trim();
}

function parseSingleCardResponse(raw: string, member: LLMing): ActionCard {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();

  if (!cleaned) {
    throw new Error("Model returned empty card summary");
  }

  // If the model ignores the 1-line rule and returns multiple lines,
  // take the first non-empty line.
  const line = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!line) {
    throw new Error("No usable line found in model card output");
  }

  return {
    llmingId: member.id,
    summary: line,
  };
}

