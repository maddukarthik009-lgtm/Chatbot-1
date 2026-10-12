import OpenAI from "openai";
import { Router, type IRouter } from "express";
import {
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const maxConversationCharacters = 24_000;
const rateLimitWindowMs = 60_000;
const maxRequestsPerWindow = 10;
let rateLimitWindowStartedAt = Date.now();
let requestsInWindow = 0;

router.post("/chat/completions", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please send a valid conversation." });
    return;
  }

  const { messages } = parsed.data;
  const totalCharacters = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  if (
    messages.at(-1)?.role !== "user" ||
    totalCharacters > maxConversationCharacters
  ) {
    res.status(400).json({
      error: "The latest message must be from you and the conversation must be shorter.",
    });
    return;
  }

  const now = Date.now();
  if (now - rateLimitWindowStartedAt >= rateLimitWindowMs) {
    rateLimitWindowStartedAt = now;
    requestsInWindow = 0;
  }
  if (requestsInWindow >= maxRequestsPerWindow) {
    const retryAfterSeconds = Math.ceil(
      (rateLimitWindowStartedAt + rateLimitWindowMs - now) / 1000,
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "Too many messages at once. Please wait a moment and try again.",
    });
    return;
  }
  requestsInWindow += 1;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    req.log.error("OPENAI_API_KEY is not configured");
    res.status(502).json({ error: "The assistant is temporarily unavailable." });
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful, thoughtful assistant. Answer clearly and directly. Use Markdown when it helps readability, and be honest when you are unsure.",
        },
        ...messages,
      ],
    });

    const reply = completion.choices[0]?.message.content?.trim();
    if (!reply) {
      req.log.warn(
        { requestId: completion.id },
        "OpenAI returned an empty completion",
      );
      res.status(502).json({ error: "The assistant could not create a reply. Try again." });
      return;
    }

    res.json(SendChatMessageResponse.parse({ reply }));
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      req.log.error(
        { status: error.status, requestId: error.requestID },
        "OpenAI completion failed",
      );
    } else {
      req.log.error("OpenAI completion failed");
    }
    res.status(502).json({
      error: "The assistant could not respond right now. Please try again.",
    });
  }
});

export default router;
