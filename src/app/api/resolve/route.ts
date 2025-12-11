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
3) For FAILURE cases, also provide a separate "deathSummary" field in your JSON: one concise sentence clearly describing how and in what context this character dies, suitable for an end-of-run recap (no dialogue, just a clear third-person description).

Target difficulty over many runs:
- Most individual attempts should still be dangerous: SUCCESS should feel earned, not automatic.
- The bar for SUCCESS should feel meaningfully high: only ideas that are clearly well-matched, concrete, and thoughtfully applied to this obstacle should succeed; vague, half-baked, over-optimistic, or hand-wavy ideas should FAIL.

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
- Always require strong plausibility and strong thematic alignment with the obstacle before granting SUCCESS.
- Brave characters should have a slightly higher chance when attempting bold, front-line actions.
- Cowardly characters should do better when their plans are evasive or avoidant.
- Precise characters should do better with technical, puzzle-like ideas.
- Chaotic characters should have more swing: sometimes brilliant, sometimes catastrophic.
- Lucky characters get a small, fuzzy boost in ambiguous cases.
- There are only two outcomes: full SUCCESS (the character lives) or full FAILURE (the character dies), but the party always progresses either way.
- Use the party's track record to slightly color your judgment: if the run has already had several brutal failures, you may be a bit kinder to a clearly solid, well-matched plan; if the party is already unusually lucky, be a bit stricter.
- If you are genuinely torn between SUCCESS and FAILURE for a given attempt, choose FAILURE unless the idea is clearly careful, concrete, and well-supported by class and context.
- In FAILURE, the obstacle must be fully neutralized, destroyed, disarmed, or permanently bypassed *as a direct result of this character's demise*, and it must be obvious that the rest of the party can now move forward.

Tone:
- Lighthearted, cinematic, and a little ridiculous in premise, but the narration itself should feel punchy and grounded rather than jokey.
- Deaths should be tragicomic and violent; humor comes from the situation, not from winking or meta commentary.

Concise description rules:
- The vignette must still be short: aim for 1–2 short sentences.
- Keep the total under about 35 words; only use the extra space to clearly show how the threat is dealt with.
- Focus on one striking image or moment rather than a full mini-story.
- Always make it clear how this action (or death) neutralizes or bypasses the obstacle and how the party moves forward.

Death tag for the fallen:
- In addition to "success" and "vignette", you MUST produce a "deathTag" field:
  - If "success" is true, set "deathTag" to null.
  - If "success" is false, "deathTag" must be a vivid, lower-case, TWO-WORD label for how they died (e.g. "red mist", "shattered statue", "crumpled heap").
  - Avoid generic or abstract phrases; make it concrete and visceral, but still within the lighthearted, non-gorey tone.

Respond ONLY with strict JSON in this shape (no extra text):
{"success": <true if the character survives, false if they die>, "vignette": "<1 extremely short, punchy sentence (at most 2 very short sentences) describing what happens, in their voice, clearly showing how the obstacle is overcome and the path forward opens>", "deathTag": <null if success is true, or "<two-word lower-case description of how they died>" if success is false>}`
    .trim();
}

function parseResolveResponse(
  raw: string,
): {
  success: boolean;
  vignette: string;
  deathTag: string | null;
  deathSummary: string | null;
} {
  try {
    const parsed = JSON.parse(raw) as {
      success?: boolean;
      vignette?: string;
      deathTag?: string | null;
    };
    if (typeof parsed.success === "boolean") {
      return {
        success: parsed.success,
        vignette:
          parsed.vignette?.toString() ||
          (parsed.success
            ? "Somehow, the plan works just well enough to get everyone through."
            : "The plan goes spectacularly wrong in a way that still clears the path for the others."),
        deathTag:
          parsed.success === false && parsed.deathTag
            ? parsed.deathTag.toString()
            : null,
        deathSummary:
          parsed.success === false && (parsed as any).deathSummary
            ? (parsed as any).deathSummary.toString()
            : null,
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
    deathTag: null,
    deathSummary: null,
  };
}


