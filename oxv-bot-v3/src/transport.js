function cpDistanceApprox(arrivee_cp){
  const departPrefix = 17;
  const target = parseInt(String(arrivee_cp).slice(0, 2), 10);
  if (Number.isNaN(target)) return 400;
  const diff = Math.abs(target - departPrefix);
  return 50 + diff * 35;
}
export function computeTransport({ arrivee_cp, poids_kg, volume_m3 }) {
  const base = 59;
  const coefKg = 0.12;
  const coefM3 = 12;
  const coefKm = 0.55;
  const km = cpDistanceApprox(arrivee_cp);
  const price = base + (poids_kg * coefKg) + (volume_m3 * coefM3) + (km * coefKm);
  const delai = km < 150 ? 2 : km < 450 ? 3 : 4;
  return { prix_estime_eur: Math.round(price * 100) / 100, delai_jours: delai };
}
