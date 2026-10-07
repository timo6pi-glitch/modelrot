import OpenAI from "openai";

const client = new OpenAI();

// Shut down on 2026-10-23
const res = await client.chat.completions.create({
  model: "gpt-4-turbo",
  messages: [{ role: "user", content: "Hello" }],
});

// Still fine: gpt-4o and gpt-4.1 are not in the catalog
const ok = ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'];

export const reasoning = { model: 'o3-mini', fallback: `o4-mini` };
