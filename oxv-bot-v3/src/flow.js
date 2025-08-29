export const STATES = { CONTACT: 'CONTACT', BESOINS: 'BESOINS', PLAN: 'PLAN', DEVIS: 'DEVIS', LIVRAISON: 'LIVRAISON', FIN: 'FIN' };
export const ORDER = [STATES.CONTACT, STATES.BESOINS, STATES.PLAN, STATES.DEVIS, STATES.LIVRAISON, STATES.FIN];

export function nextState(current) {
  const i = ORDER.indexOf(current);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : STATES.FIN;
}

export function isComplete(state, data) {
  switch (state) {
    case STATES.CONTACT:
      return !!(data?.client?.nom && data?.client?.email && data?.client?.telephone && data?.cp || data?.client?.cp);
    case STATES.BESOINS:
      return Array.isArray(data?.modules) && data.modules.length > 0 && data.modules.every(m => m.qty > 0) && data?.usage;
    case STATES.PLAN:
      return !!(data?.modele && data?.dimensions?.diametre_mm);
    case STATES.DEVIS:
      return Array.isArray(data?.panier) && data.panier.length > 0 && data.panier.every(m => m.qty > 0 && m.qualite);
    case STATES.LIVRAISON:
      return !!(data?.arrivee_cp && data?.poids_kg && data?.volume_m3);
    default:
      return false;
  }
}
