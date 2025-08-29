import "dotenv/config";
import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

import { SYSTEM_PROMPT } from "./prompts.js";
import { STATES, isComplete, nextState } from "./flow.js";
import { ContactSchema, BesoinsSchema, PlanSchema, DevisSchema, LivraisonSchema } from "./validators.js";
import { buildQuote } from "./pricing.js";
import { generatePlanSVG, savePlanFiles } from "./plan.js";
import { computeTransport } from "./transport.js";
import { logger } from "./utils/logger.js";
import { asyncHandler, errorMiddleware } from "./utils/errors.js";
import { securityStack } from "./middleware/security.js";

// ---------- App Bootstrap ----------
const app = express();
app.set("trust proxy", 1); // nécessaire sur Render pour req.protocol = https derrière proxy

// CORS: autorise localhost (dev) et onrender.com (prod)
app.use(cors({
  origin: [/^https?:\/\/localhost(:\d+)?$/, /onrender\.com$/],
  credentials: false
}));

app.use(express.json({ limit: "2mb" }));
securityStack().forEach(mw => app.use(mw));
app.use(logger);

// Dossiers statiques & stockage
fs.mkdirSync("public", { recursive: true });
fs.mkdirSync("storage", { recursive: true });
app.use(express.static("public"));
app.use("/storage", express.static("storage"));

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ---------- Session store (en mémoire) ----------
const sessions = new Map();

// ---------- Helpers ----------
function makeAbsUrl(req, relPath) {
  const host = req.get("host");
  const proto = req.protocol || "https";
  const path = String(relPath || "").replace(/^\/+/, "");
  return `${proto}://${host}/${path}`;
}

function extractJsonCandidate(txt) {
  if (!txt) return null;

  // 1) Bloc ```json ... ```
  const fence = /```json\s*([\s\S]*?)\s*```/i.exec(txt);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]); } catch {}
  }

  // 2) Premier objet {...} équilibré
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = txt.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }

  // 3) Tentative directe
  try { return JSON.parse(txt); } catch {}
  return null;
}

function safeShorten(text, maxSentences = 2) {
  if (!text) return "Pouvez-vous préciser votre besoin ? Je peux créer un plan, un devis ou estimer la livraison.";
  const parts = text.split(/[.!?]\s/).slice(0, maxSentences).join(". ");
  return parts.endsWith(".") ? parts : parts + ".";
}

function ensureSession(sessId) {
  if (sessId && sessions.has(sessId)) {
    return { id: sessId, sess: sessions.get(sessId), created: false };
  }
  const newId = uuidv4();
  const init = { state: STATES.CONTACT, data: {}, history: [] };
  sessions.set(newId, init);
  return { id: newId, sess: init, created: true };
}

// ---------- Routes ----------
app.get("/", (_req, res) => {
  res.type("text/plain").send("OXV-API en ligne. Routes: /health, /session/start, /chat, /plan, /devis, /transport");
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/session/start", (_req, res) => {
  const { id } = ensureSession(null);
  res.json({ session_id: id });
});

app.post("/chat", asyncHandler(async (req, res) => {
  const { session_id, message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message manquant", hint: "Envoyez { session_id?, message: '...' }" });
  }

  // Auto-création de session si absente
  const { id, sess, created } = ensureSession(session_id);
  if (created) {
    res.setHeader("x-session-id", id);
  }

  // Historique utilisateur
  sess.history.push({ role: "user", content: message });

  // Message d’accueil plus fluide si tout début
  if (sess.history.length === 1) {
    const welcome = "Bonjour 👋 Je suis OXV-Bot. Dites-moi simplement ce dont vous avez besoin : un plan, un devis, ou une estimation de livraison. Par exemple : « 200 palettes 800×1200 pour un usage pro ».";
    sess.history.push({ role: "assistant", content: welcome });
    return res.json({ session_id: id, message: welcome, state: sess.state, data: sess.data });
  }

  // Appel OpenAI protégé
  let content = "";
  try {
    if (!process.env.OPENAI_API_KEY) {
      // Fallback sans OpenAI: réponse simple guidée
      content = "Je peux vous générer un plan, un devis ou une estimation de transport. Précisez le modèle (ex: palette 800×1200), la quantité et l’usage (pro/particulier).";
    } else {
      const r = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...sess.history]
      });
      content = r.choices?.[0]?.message?.content?.trim() || "";
    }
  } catch (err) {
    console.error("OpenAI error:", err?.message || err);
    content = "Je n’ai pas pu générer de réponse pour le moment. Voulez-vous que je passe directement au plan, devis ou transport ?";
  }

  // Essaye d’extraire un JSON structuré
  const jsonOut = extractJsonCandidate(content);

  function mergeData(intent, payload) {
    switch (intent) {
      case "CONTACT":
        Object.assign(sess, { data: { ...sess.data, ...ContactSchema.parse(payload) } });
        break;
      case "BESOINS":
        Object.assign(sess, { data: { ...sess.data, ...BesoinsSchema.parse(payload) } });
        break;
      case "PLAN":
        Object.assign(sess, { data: { ...sess.data, ...PlanSchema.parse(payload) } });
        break;
      case "DEVIS":
        Object.assign(sess, { data: { ...sess.data, ...DevisSchema.parse(payload) } });
        break;
      case "LIVRAISON":
        Object.assign(sess, { data: { ...sess.data, ...LivraisonSchema.parse(payload) } });
        break;
      default:
        break;
    }
  }

  if (jsonOut?.intent) {
    // Accepte les sauts d’étapes si l’intention est claire (logique plus souple)
    mergeData(jsonOut.intent, jsonOut);
    if (isComplete(sess.state, sess.data)) {
      sess.state = nextState(sess.state);
    }
    sess.history.push({ role: "assistant", content });
    return res.json({ session_id: id, message: content, state: sess.state, data: sess.data });
  }

  // Pas de JSON exploitable -> réponse courte et claire
  const short = safeShorten(content);
  sess.history.push({ role: "assistant", content: short });
  return res.json({ session_id: id, message: short, state: sess.state, data: sess.data });
}));

app.post("/plan", asyncHandler(async (req, res) => {
  const { modele = "hexagone", diametre_mm = 3000, hauteur_mm = 900 } = req.body || {};
  const svg = generatePlanSVG({ modele, diametre_mm, hauteur_mm });
  const id = uuidv4();
  const { svgPath, pdfPath } = savePlanFiles({ id, svg });

  return res.json({
    intent: "PLAN",
    modele,
    dimensions: { diametre_mm, hauteur_mm },
    sortie: {
      svg_url: makeAbsUrl(req, svgPath),
      pdf_url: makeAbsUrl(req, pdfPath)
    }
  });
}));

app.post("/devis", asyncHandler(async (req, res) => {
  const { panier } = req.body || {};
  if (!Array.isArray(panier) || panier.length === 0) {
    return res.status(400).json({ error: "panier invalide", hint: "Ex: { panier: [{ref:'MODULE-845x1200', qty:10, prix_unitaire:25.5}] }" });
  }
  const prix = buildQuote(panier);
  return res.json({
    intent: "DEVIS",
    panier,
    prix,
    conditions: { validite_jours: 15, delai_fabrication_jours: 7 }
  });
}))

