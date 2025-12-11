import { NextResponse } from "next/server";
import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { ActionCard, LLMing, Obstacle } from "@/data/llmings";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      obstacle?: Obstacle;
      card?: ActionCard;
      partyMember?: LLMing;
      partyHistory?: {
        id: number;
        name: string;
        history: LLMing["history"];
      }[];
    };

    const { obstacle, card, partyMember, partyHistory } = body;

    if (!obstacle || !card || !partyMember) {
      return NextResponse.json(
        { error: "Missing obstacle, card, or party member" },
        { status: 400 },
      );
    }

    const openai = getOpenAIClient();
    const prompt = buildResolvePrompt(obstacle, partyMember, card, partyHistory);

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
    const parsed = parseResolveResponse(raw);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error in /api/resolve:", error);
    return NextResponse.json(
      { error: "Failed to resolve outcome" },
      { status: 500 },
    );
  }
}

function buildResolvePrompt(
  obstacle: Obstacle,
  member: LLMing,
  card: ActionCard,
  partyHistory: { id: number; name: string; history: LLMing["history"] }[] = [],
): string {
  const historyLines = member.history
    .map((h) => {
      const label = h.outcome === "success" ? "succeeded" : "died";
      return `- Obstacle ${h.obstacleIndex + 1}: ${label} attempting "${h.cardSummary}".`;
    })
    .join("\n");

  const partySummary =
    partyHistory
      ?.map((p) => {
        const deaths = p.history.filter((h) => h.outcome === "failure").length;
        const successes = p.history.filter(
          (h) => h.outcome === "success",
        ).length;
        if (!deaths && !successes) return null;
        return `- ${p.name}: ${successes} successes, ${deaths} deaths so far in this run.`;
      })
      .filter(Boolean)
      .join("\n") || "(no prior outcomes yet)";

  return `You are the outcome judge and narrator for a comedic fantasy dungeon crawler.

The player has chosen ONE character's idea to attempt at the current obstacle.
Your job:
1) Decide whether the attempt is a SUCCESS or a FAILURE.
2) Write a very short vignette describing what happens, in the style of the chosen character's voice.

Target difficulty over many runs:
- On average, about 3–4 out of 5 obstacles in a run should be SUCCESS.
- It should feel like risky or ridiculous plans can still miraculously work sometimes, but obviously doomed plans should fail more often.

Obstacle:
- Title: ${obstacle.title}
- Kind: ${obstacle.kind}
- Description: ${obstacle.description}

Chosen character:
- Name: ${member.name}
- Personality: ${member.personality}
- Class: ${member.characterClass}
- Trait: ${member.trait}
- Voice style: ${member.voice}

Their proposed action:
- Summary: ${card.summary}
- Detail: ${card.detail || "(no extra detail)"}

This character's prior attempts in THIS run:
${historyLines || "(none yet)"}

Whole party's track record so far:
${partySummary}

Rules for your ruling:
- Consider both the cleverness and the absurdity of the idea.
- Brave characters should have a slightly higher chance when attempting bold, front-line actions.
- Cowardly characters should do better when their plans are evasive or avoidant.
- Precise characters should do better with technical, puzzle-like ideas.
- Chaotic characters should have more swing: sometimes brilliant, sometimes catastrophic.
- Lucky characters get a small, fuzzy boost in ambiguous cases.
- There are only two outcomes: full SUCCESS (the character lives) or full FAILURE (the character dies), but the party always progresses either way.

Tone:
- Lighthearted, cinematic, and a little ridiculous.
- Deaths should be tragicomic rather than gruesome.

Concise description rules:
- The vignette must be extremely short: aim for about 1 short sentence, and never more than 2 very short sentences.
- Keep the total under 25 words.
- Focus on one striking image or moment rather than a full mini-story.

Respond ONLY with strict JSON in this shape (no extra text):
{"success": <true if the character survives, false if they die>, "vignette": "<1 extremely short, punchy sentence (at most 2 very short sentences) describing what happens, in their voice>"}`
    .trim();
}

function parseResolveResponse(
  raw: string,
): { success: boolean; vignette: string } {
  try {
    const parsed = JSON.parse(raw) as {
      success?: boolean;
      vignette?: string;
    };
    if (typeof parsed.success === "boolean") {
      return {
        success: parsed.success,
        vignette:
          parsed.vignette?.toString() ||
          (parsed.success
            ? "Somehow, the plan works just well enough to get everyone through."
            : "The plan goes spectacularly wrong in a way that still clears the path for the others."),
      };
    }
  } catch {
    // ignore and fall through
  }

  return {
    success: false,
    vignette:
      raw ||
      "The outcome text was malformed, and the dungeon referee calls the attempt a failure by default.",
  };
}


