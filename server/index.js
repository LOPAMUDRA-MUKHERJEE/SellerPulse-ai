
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { generateAIResponse,generateInsights, AIServiceError } from "./ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
const distPath = path.join(__dirname, "..", "dist");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5175"]
  })
);

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "SellerPulse AI backend is running."
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "A valid conversation history is required."
      });
    }

    if (messages.length > 40) {
      return res.status(400).json({
        success: false,
        error: "Conversation limit reached. Please start a new conversation."
      });
    }

    const validMessages = messages.every(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim().length > 0 &&
        message.content.length <= 3000
    );

    if (!validMessages) {
      return res.status(400).json({
        success: false,
        error: "Invalid conversation format."
      });
    }

    const { text, provider } = await generateAIResponse(messages);
    return res.json({ success: true, reply: text, provider });
  } catch (error) {
    console.error("AI API Error:", {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      requestId: error.request_id
    });

    if (error instanceof AIServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: "Something went wrong while processing your message. Please try again."
    });
  }
});

app.post("/api/insights", async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      return res.status(400).json({ success: false, error: "Invalid conversation." });
    }
    const { insights, provider } = await generateInsights(messages);
    return res.json({ success: true, insights, provider });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// Serve the built frontend (same origin, so no CORS needed in production)
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`SellerPulse AI backend running on port ${PORT}`);
});