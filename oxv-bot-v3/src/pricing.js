export const PRICING = {
  "MOD-845x1200": { "1er": 22.0, "2e": 17.0 }
};
export function buildQuote(panier) {
  let ht = 0;
  for (const item of panier) {
    const price = PRICING[item.sku]?.[item.qualite] ?? 0;
    ht += price * item.qty;
  }
  const tva = Math.round(ht * 0.2 * 100) / 100;
  const ttc = Math.round((ht + tva) * 100) / 100;
  return { ht: round2(ht), tva: round2(tva), ttc: round2(ttc), devise: "EUR" };
}
function round2(x){ return Math.round(x*100)/100; }
