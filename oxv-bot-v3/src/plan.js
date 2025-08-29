import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export function generatePlanSVG({ modele = "hexagone", diametre_mm = 3000, hauteur_mm = 900 }) {
  if (modele !== "hexagone") modele = "hexagone";
  const radius = diametre_mm / 2;
  const points = Array.from({length:6}).map((_,i)=>{
    const angle = (Math.PI/3) * i - Math.PI/6;
    const x = radius + radius * Math.cos(angle);
    const y = radius + radius * Math.sin(angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const size = diametre_mm;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">
  <polygon points="${points}" fill="none" stroke="black" stroke-width="4"/>
  <circle cx="${radius}" cy="${radius}" r="6" fill="black"/>
  <text x="10" y="20" font-size="24">Modèle: ${modele} — Ø ${diametre_mm} mm — H ${hauteur_mm} mm</text>
</svg>`;
}

export function savePlanFiles({ outDir = "storage/plan", id, svg }) {
  fs.mkdirSync(outDir, { recursive: true });
  const svgPath = path.join(outDir, `${id}.svg`);
  fs.writeFileSync(svgPath, svg, "utf-8");

  const pdfPath = path.join(outDir, `${id}.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 20 });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  doc.fontSize(16).text("Plan OXV — Palettes Distribution", { align: "center" });
  doc.moveDown().fontSize(12).text("Le SVG fournit les dimensions exactes en mm. Ce PDF est un aperçu.");
  doc.rect(50, 120, 500, 500).stroke();
  doc.fontSize(10).text(`Fichier SVG: ${id}.svg`, 60, 640);
  doc.end();
  return { svgPath, pdfPath };
}
