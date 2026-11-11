
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sellerData, systemPrompt } from "./sellerData.js";

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env")
});

export class AIServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "AIServiceError";
    this.statusCode = statusCode;
  }
}

// Providers are tried in order. Both speak the OpenAI chat format.
function buildProviders() {
  const list = [];

  if (process.env.GROQ_API_KEY) {
    list.push({
      name: "groq",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
        maxRetries: 0,
        timeout: 15000
      }),
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      maxTokens: 1000,
      extra: { reasoning_effort: "low" }
    });
  }

  if (process.env.GEMINI_API_KEY) {
    list.push({
      name: "gemini",
      client: new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        maxRetries: 0,
        timeout: 15000
      }),
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      // Gemini counts hidden reasoning tokens against this limit,
      // so a small value cuts replies off mid-sentence.
      maxTokens: 1500
    });
  }

  return list;
}

function getAskedQuestions(messages) {
  return messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.content.match(/[^.?!]*\?/g) || [])
    .map((q) => q.trim())
    .filter(Boolean);
}

const VOICE_RULES = `
VOICE RULES (your words are spoken aloud on a phone call):
- Reply in 2 to 3 short sentences, under 60 words. Recommendations and the final summary may use up to 90 words.
- Plain spoken English only. No bullet points, no numbered lists, no bold, no headings, no emojis.
- Say numbers like a person: "two lakh", "one lakh thirty-five thousand", "thirty-two percent".
- Ask only one question, and put it at the end.
- Do not repeat figures the seller already heard.
- Average selling price is unchanged at five hundred rupees, so the drop is in order volume, not price per order. Say that if it comes up.
- Never say stockouts caused the whole decline. Say they are the most likely contributor, and name what is still unchecked: visibility and competitor pricing.
- Before you recommend anything, make sure you have asked at least one question about cancellations or visibility.
- Final summary: three sentences at most, spoken style, no lists.
- In your first or second reply, mention the cancellation rate moving from eight to fourteen percent and out-of-stock products going from five to eighteen. Say these once, in spoken form.
- Before the summary, ask at least one question about pricing or competitors.
- Never state anything about visibility or search ranking as fact. Say the data does not show it.
- Do not invent numbers such as buffer percentages. Say "a buffer" or call a figure a rule of thumb.
- If the seller says they are done, give a short goodbye and do not ask a question.
- Exactly one question mark per reply. Never ask two questions.
- Never say stockouts or stock gaps "cause", "drive", "fuel" or "explain" the decline. Say "likely contributing" or "may be contributing".
- If the seller says they cannot do something (change prices, review daily, run promotions), never recommend it again. Offer a lighter version or move on.
- Never ask a question already asked in this conversation. If the seller declines or does not know, accept it and move on.
- If the seller says that is enough, that will be all, nothing else, thanks, okay bye, or any similar closing phrase, give a one-sentence goodbye and ask no question.
- If the seller asks for a summary of everything or says wrap up, give: the main issues, two or three recommended actions that respect what the seller said they can do, and one next step. Under 90 words, spoken style, no question.
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractText(response) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .join("")
      .trim();
  }
  return "";
}

function keepLastQuestion(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return text;
  const qIdx = sentences.map((s, i) => (s.trim().endsWith("?") ? i : -1)).filter((i) => i >= 0);
  if (qIdx.length <= 1) return text;
  const last = qIdx[qIdx.length - 1];
  return sentences.filter((s, i) => !s.trim().endsWith("?") || i === last).join("").trim();
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[\u2011\u2010\u2013]/g, "-")
    .replace(/\s+%/g, "%")
    .replace(/([.!?:])\s*\n+/g, "$1 ")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function capWords(text, max = 110) {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  const cut = words.slice(0, max).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return lastStop > 40 ? cut.slice(0, lastStop + 1) : cut + ".";
}

export async function generateAIResponse(messages) {
  const providers = buildProviders();

  if (providers.length === 0) {
    throw new AIServiceError("No AI provider key is configured.", 500);
  }

  // Clone history and append spoken reminder to the last user message
  const history = messages.map((m) => ({ role: m.role, content: m.content }));
  const last = history[history.length - 1];
  if (last && last.role === "user") {
    last.content += "\n\n[Reply as spoken words: under 60 words, no lists, no markdown, one question at the end.]";
  }

  const asked = getAskedQuestions(messages);
  const askedBlock = asked.length
    ? `\n\nQuestions you have ALREADY asked (never repeat or rephrase these):\n${asked.map((q) => `- ${q}`).join("\n")}\nIf the seller declined or didn't know an answer, accept it and move on.`
    : "";

  const fullSystemPrompt = systemPrompt + askedBlock;

  const formattedMessages = [
    {
      role: "system",
      content: `${fullSystemPrompt}

SELLER BUSINESS CONTEXT:
${JSON.stringify(sellerData, null, 2)}

The seller data above is authoritative. Use the full conversation history.
Do not repeat questions the seller already answered.
${VOICE_RULES}`
    },
    ...history
  ];

  let lastStatus = 502;

  for (const p of providers) {
    // One retry per provider for rate limits, then move on to the next one.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await p.client.chat.completions.create({
          model: p.model,
          messages: formattedMessages,
          temperature: 0.5,
          max_tokens: p.maxTokens,
          ...(p.extra || {})
        });

        const answer = extractText(response);
        if (!answer) throw new Error("Empty response");

        console.log(`[ai] answered by ${p.name}`);
        // return { text: capWords(stripMarkdown(answer)), provider: p.name };
        return { text: capWords(keepLastQuestion(stripMarkdown(answer))), provider: p.name };

      } catch (error) {
        lastStatus = Number(error.status) || 502;
        console.error(
          `[ai] ${p.name} attempt ${attempt + 1} failed:`,
          error.status,
          error.message?.slice(0, 200)
        );

        const retryable = [429, 500, 502, 503, 504].includes(error.status);
        if (retryable && attempt === 0) {
          await sleep(1200);
          continue;
        }
        break; // 400/401/404 will not improve, so go to the next provider
      }
    }
  }

  throw new AIServiceError(
    "The AI services are busy right now. Local demo mode can be used.",
    lastStatus === 429 ? 429 : 503
  );
}

export async function generateInsights(messages) {
  const providers = buildProviders();
  if (providers.length === 0) throw new AIServiceError("No AI provider key is configured.", 500);

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Seller" : "KAM"}: ${m.content}`)
    .join("\n");

  const prompt = `You are summarising a finished call between a Snapdeal seller and a virtual Key Account Manager.

SELLER DATA (authoritative):
${JSON.stringify(sellerData, null, 2)}

CALL TRANSCRIPT:
${transcript}

Return ONLY valid JSON, no markdown, in this shape:
{
  "issues": ["max 4 short strings, from data plus what the seller said"],
  "recommendations": [{"title": "short action", "why": "one sentence tied to the conversation"}],
  "nextSteps": ["max 3 short strings the seller agreed or said they could do"],
  "goals": [{"metric": "name", "from": "value", "target": "value"}]
}
Rules:
- 2 to 3 recommendations only. Never recommend anything the seller said they cannot do.
- Say "likely contributing", never "caused" or "proven".
- Do not claim anything about visibility or search ranking as fact; the data has none.
- In goals, every "from" must come from the seller data, and every "target" must be the previous-month value from the seller data. Invent no other numbers.`;

  for (const p of providers) {
    try {
      const response = await p.client.chat.completions.create({
        model: p.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: p.maxTokens,
        ...(p.extra || {})
      });
      const raw = extractText(response);
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      return { insights: JSON.parse(json), provider: p.name };
    } catch (error) {
      console.error(`[insights] ${p.name} failed:`, error.status, error.message?.slice(0, 200));
    }
  }
  throw new AIServiceError("Could not generate the summary.", 503);
}