import { NextResponse } from "next/server";
import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { Obstacle } from "@/data/llmings";

type ObstaclesPayload = {
  obstacles?: {
    title?: string;
    description?: string;
    kind?: Obstacle["kind"];
  }[];
};

export async function POST() {
  try {
    const openai = getOpenAIClient();
    const prompt = buildObstaclesPrompt();

    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL_ID,
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
      max_completion_tokens: 800,
      reasoning_effort:
        DEFAULT_MODEL_ID === "gpt-5.1-2025-11-13" ? ("none" as any) : "minimal",
      verbosity: "low",
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    console.log("[LLMings] /api/obstacles raw LLM content:", raw);

    const obstacles = parseObstaclesResponse(raw);

    return NextResponse.json({ obstacles });
  } catch (error) {
    console.error("Error in /api/obstacles:", error);
    const message =
      error instanceof Error ? error.message : "Unknown obstacles error";
    return NextResponse.json(
      { error: "Failed to generate obstacles", details: message },
      { status: 500 },
    );
  }
}

function buildObstaclesPrompt(): string {
  return `You are the dungeon architect for a lighthearted text-based adventure game.

Create a full run of FIVE distinct, vivid obstacles for a party of five adventurers traversing a fantasy dungeon.

High-level goals:
- Across the five obstacles, explore a wide variety of ideas, tones, and threat types.
- Each obstacle should feel like it belongs in the same strange dungeon, but none of them should feel like palette-swapped copies.

Global rules:
- The tone is adventurous and cinematic with room for eccentricity, not grimdark.
- The party always progresses after each obstacle is resolved (success or failure is handled elsewhere).
- Avoid explicit gore or real-world tragedies; keep deaths cartoonish if implied.
- Obstacles must feel like big, memorable D&D/roguelite setpieces that could realistically kill an unwary adventurer.
- Descriptions must be extremely short but flavorful.
- Each description must be EXACTLY ONE simple sentence, maximum 18 words.
- Do NOT describe how an obstacle can be solved, bypassed, tricked, disarmed, or outwitted.
- Do NOT talk about what the party "must" do, "needs" to do, or "can" do.
- Do NOT use phrases like "to proceed", "until", "unless", "if they", "so they can", or "in order to".
- Only state what the obstacle is and what it currently does or threatens, in one punchy line.

Variety and anti-trope rules:
- Across the five obstacles, avoid repeating the same central gimmick more than once (no multiple gongs, multiple bridges, multiple doors, etc.).
- Avoid overused fantasy dungeon tropes as the main idea: no plain portcullises, generic locked doors, simple bridges over chasms, standard spike pits, lone ominous levers, or a single big gong as the whole concept.
- Strongly prefer eccentric, surprising concepts that could exist only in this dungeon:
  - living or opinionated architecture,
  - cursed emotions or memories,
  - absurd dungeon bureaucracy,
  - impossible physics and geometry,
  - weaponized etiquette or manners,
  - enchanted or dangerous food and drink,
  - musical or rhythmic hazards,
  - social taboos or party dynamics turned lethal.
- Think in terms of dangerous systems or situations, not just "a monster blocking a corridor".
- It is fine if one of the obstacles is primarily a monster, one primarily a trap, one primarily a weird hazard, etc., but they should each feel conceptually distinct.

Output format (no extra commentary, no code fences):
- Respond ONLY with strict JSON in this exact shape:
{"obstacles":[
  {"title": "<short obstacle title 1>", "description": "<1 short sentence>", "kind": "<trap|monster|hazard|puzzle|weird>"},
  {"title": "<short obstacle title 2>", "description": "<1 short sentence>", "kind": "<trap|monster|hazard|puzzle|weird>"},
  {"title": "<short obstacle title 3>", "description": "<1 short sentence>", "kind": "<trap|monster|hazard|puzzle|weird>"},
  {"title": "<short obstacle title 4>", "description": "<1 short sentence>", "kind": "<trap|monster|hazard|puzzle|weird>"},
  {"title": "<short obstacle title 5>", "description": "<1 short sentence>", "kind": "<trap|monster|hazard|puzzle|weird>"}
]}`.trim();
}

function parseObstaclesResponse(raw: string): Obstacle[] {
  try {
    const parsed = JSON.parse(raw) as ObstaclesPayload;
    const list = Array.isArray(parsed.obstacles) ? parsed.obstacles : [];

    if (list.length === 0) {
      throw new Error("No obstacles array found in model output");
    }

    const allowedKinds: Obstacle["kind"][] = [
      "trap",
      "monster",
      "hazard",
      "puzzle",
      "weird",
    ];

    const obstacles: Obstacle[] = list.map((o, idx) => {
      const title = (o.title || `Mischievous dungeon complication ${idx + 1}`).toString();
      const description = (
        o.description ||
        "Something in the corridor is absolutely up to no good."
      ).toString();
      const kind: Obstacle["kind"] = allowedKinds.includes(o.kind as any)
        ? (o.kind as Obstacle["kind"])
        : "weird";

      return {
        index: idx,
        title,
        description,
        kind,
      };
    });

    return obstacles;
  } catch (error) {
    console.error("[LLMings] Failed to parse obstacles JSON from model:", error);
    // Fallback: treat the raw string like a single obstacle repeated five times.
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = lines[0] || "Mischievous dungeon complication";
    const description =
      lines.slice(1).join(" ") ||
      "Something in the corridor is absolutely up to no good.";

    const fallback: Obstacle[] = Array.from({ length: 5 }, (_, idx) => ({
      index: idx,
      title: idx === 0 ? title : `${title} (${idx + 1})`,
      description,
      kind: "weird",
    }));

    return fallback;
  }
}


