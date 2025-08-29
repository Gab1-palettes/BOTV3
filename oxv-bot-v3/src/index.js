import "dotenv/config"; // <- plus portable que "dotenv/config.js"
import express from "express";
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

const app = express();
app.use(express.json({ limit: "2mb" }));
securityStack().forEach(mw => app.use(mw));
app.use(logger);
app.use(express.static("public"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
fs.mkdirSync("storage", { recursive: true });

const sessions = new Map();

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/session/start", (req, res) => {
  const session_id = uuidv4();
  const init = { state: STATES.CONTACT, data: {}, history: [] };
  sessions.set(session_id, init);
  res.json({ session_id });
});

app.post("/chat", asyncHandler(async (req, res) => {
  const { session_id, message } = req.body;
  let sess = null;
if (!session_id || !sessions.has(session_id)) {
  // auto-création
  const new_id = uuidv4();
  sess = { state: STATES.CONTACT, data: {}, history: [] };
  sessions.set(new_id, sess);
  console.log("Nouvelle session auto-créée:", new_id);
  // on renvoie le session_id dans la réponse
  res.setHeader("x-session-id", new_id);
} else {
  sess = sessions.get(session_id);
}

  if (!message) return res.status(400).json({ error: "message manquant" });

  const sess = sessions.get(session_id);
  if (!sess) return res.status(404).json({ error: "session inconnue" });

  const { state, history } = sess;

  // (optionnel mais recommandé) on garde aussi le message côté historique
  history.push({ role: "user", content: message });

  const r = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 300,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history]
  });

  let content = r.choices?.[0]?.message?.content?.trim() || "";
  let jsonOut = null; try { jsonOut = JSON.parse(content); } catch {}

  function mergeData(intent, payload){
    switch (intent) {
      case "CONTACT":   Object.assign(sess, { data: { ...sess.data, ...ContactSchema.parse(payload) }}); break;
      case "BESOINS":   Object.assign(sess, { data: { ...sess.data, ...BesoinsSchema.parse(payload) }}); break;
      case "PLAN":      Object.assign(sess, { data: { ...sess.data, ...PlanSchema.parse(payload) }}); break;
      case "DEVIS":     Object.assign(sess, { data: { ...sess.data, ...DevisSchema.parse(payload) }}); break;
      case "LIVRAISON": Object.assign(sess, { data: { ...sess.data, ...LivraisonSchema.parse(payload) }}); break;
    }
  }

  if (jsonOut?.intent) {
    mergeData(jsonOut.intent, jsonOut);
    if (isComplete(state, sess.data)) sess.state = nextState(state);
    history.push({ role: "assistant", content });
    return res.json({ message: content, state: sess.state, data: sess.data });
  }

  content = content.split(/[.!?]\s/).slice(0, 2).join(". ") + ".";
  history.push({ role: "assistant", content });
  res.json({ message: content, state: sess.state, data: sess.data });
}));

app.post("/plan", asyncHandler(async (req, res) => {
  const { modele = "hexagone", diametre_mm = 3000, hauteur_mm = 900 } = req.body || {};
  const svg = generatePlanSVG({ modele, diametre_mm, hauteur_mm });
  const id = uuidv4();
  const { svgPath, pdfPath } = savePlanFiles({ id, svg });

  // ⚠️ Correction ici: f-strings -> template literals
  res.json({
    intent: "PLAN",
    modele,
    dimensions: { diametre_mm, hauteur_mm },
    sortie: {
      svg_url: `/${svgPath}`,
      pdf_url: `/${pdfPath}`
    }
  });
}));

app.post("/devis", asyncHandler(async (req, res) => {
  const { panier } = req.body || {};
  if (!Array.isArray(panier) || panier.length === 0) {
    return res.status(400).json({ error: "panier invalide" });
  }
  const prix = buildQuote(panier);
  res.json({ intent: "DEVIS", panier, prix, conditions: { validite_jours: 15, delai_fabrication_jours: 7 } });
}));

app.post("/transport", asyncHandler(async (req, res) => {
  const { arrivee_cp, poids_kg, volume_m3 } = req.body || {};
  if (!arrivee_cp || !poids_kg || !volume_m3) {
    return res.status(400).json({ error: "arrivee_cp, poids_kg, volume_m3 requis" });
  }
  const out = computeTransport({ arrivee_cp, poids_kg, volume_m3 });
  res.json({
    intent: "LIVRAISON",
    depart: process.env.DEPART_VILLE || "Montlieu-la-Garde",
    arrivee_cp,
    poids_kg,
    volume_m3,
    ...out
  });
}));

app.use("/storage", express.static("storage"));
app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OXV-Bot running on http://localhost:${PORT}`));
