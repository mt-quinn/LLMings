import { NextResponse } from "next/server";
import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { Obstacle } from "@/data/llmings";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      index?: number;
    };

    const index = typeof body.index === "number" ? body.index : 0;

    const openai = getOpenAIClient();
    const prompt = buildObstaclePrompt(index);

    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL_ID,
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
      max_completion_tokens: 200,
      reasoning_effort:
        DEFAULT_MODEL_ID === "gpt-5.1-2025-11-13" ? ("none" as any) : "minimal",
      verbosity: "low",
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const obstacle = parseObstacleResponse(raw, index);

    return NextResponse.json({ obstacle });
  } catch (error) {
    console.error("Error in /api/obstacle:", error);
    const message =
      error instanceof Error ? error.message : "Unknown obstacle error";
    return NextResponse.json(
      { error: "Failed to generate obstacle", details: message },
      { status: 500 },
    );
  }
}

function buildObstaclePrompt(index: number): string {
  return `You are the dungeon architect for a lighthearted text-based adventure game.

Create a single, vivid obstacle for a party of five adventurers traversing a fantasy dungeon.

Rules:
- The tone is playful, absurd, and slightly comedic, not grimdark.
- The party always progresses after the obstacle is resolved (success or failure is handled elsewhere).
- Avoid explicit gore or real-world tragedies; keep deaths cartoonish if implied.
- The description must be extremely short but flavorful.
- Write the description as EXACTLY ONE simple sentence, maximum 18 words.
- Do NOT describe how the obstacle can be solved, bypassed, tricked, disarmed, or outwitted.
- Do NOT talk about what the party \"must\" do, \"needs\" to do, or \"can\" do.
- Do NOT use phrases like \"to proceed\", \"until\", \"unless\", \"if they\", \"so they can\", or \"in order to\".
- Only state what the obstacle is and what it currently does or threatens, in one punchy line.

This is obstacle number ${index + 1} out of 5 in today's dungeon.

Respond ONLY with strict JSON in this shape (no extra text):
{"title": "<short obstacle title>", "description": "<2 short sentences describing the situation>", "kind": "<one of: trap | monster | hazard | puzzle | weird>"}`.trim();
}

function parseObstacleResponse(raw: string, index: number): Obstacle {
  try {
    const parsed = JSON.parse(raw) as {
      title?: string;
      description?: string;
      kind?: Obstacle["kind"];
    };
    const title = (parsed.title || "Mischievous dungeon complication").toString();
    const description = (
      parsed.description ||
      "Something in the corridor is absolutely up to no good."
    ).toString();
    const allowedKinds: Obstacle["kind"][] = [
      "trap",
      "monster",
      "hazard",
      "puzzle",
      "weird",
    ];
    const kind: Obstacle["kind"] = allowedKinds.includes(parsed.kind as any)
      ? (parsed.kind as Obstacle["kind"])
      : "weird";

    return { index, title, description, kind };
  } catch {
    // Fallback: try to salvage a title/description from raw text.
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = lines[0] || "Mischievous dungeon complication";
    const description =
      lines.slice(1).join(" ") ||
      "Something in the corridor is absolutely up to no good.";
    return {
      index,
      title,
      description,
      kind: "weird",
    };
  }
}

