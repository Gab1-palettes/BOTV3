import { z } from "zod";

export const ContactSchema = z.object({
  intent: z.literal("CONTACT"),
  client: z.object({
    nom: z.string().min(1),
    societe: z.string().optional().default(""),
    email: z.string().email(),
    telephone: z.string().min(6),
    adresse: z.string().optional().default(""),
    cp: z.string().min(4).optional(),
    ville: z.string().optional().default("")
  }),
  opt_rappel: z.object({
    canal: z.enum(["tel","email"]).optional().default("email"),
    plage_horaire: z.enum(["AM","PM"]).optional().default("AM")
  }).optional().default({canal:"email",plage_horaire:"AM"})
});

export const BesoinsSchema = z.object({
  intent: z.literal("BESOINS"),
  usage: z.enum(["pro","particulier"]),
  modules: z.array(z.object({
    sku: z.string().min(1),
    qty: z.number().int().positive()
  })).min(1),
  contraintes: z.object({
    dimensions_mm: z.object({
      diametre: z.number().int().nullable().optional(),
      largeur: z.number().int().nullable().optional(),
      hauteur: z.number().int().optional().default(900)
    }).optional().default({hauteur:900}),
      budget_eur: z.number().nullable().optional(),
      couleur: z.string().nullable().optional()
  }).optional().default({})
});

export const PlanSchema = z.object({
  intent: z.literal("PLAN"),
  modele: z.enum(["hexagone","autre"]),
  dimensions: z.object({
    diametre_mm: z.number().int().positive(),
    hauteur_mm: z.number().int().positive().default(900)
  }),
  sortie: z.object({
    svg_url: z.string(),
    pdf_url: z.string()
  })
});

export const DevisSchema = z.object({
  intent: z.literal("DEVIS"),
  panier: z.array(z.object({
    sku: z.string(),
    qty: z.number().int().positive(),
    qualite: z.enum(["1er","2e"])
  })).min(1),
  prix: z.object({
    ht: z.number().nonnegative(),
    tva: z.number().nonnegative(),
    ttc: z.number().nonnegative(),
    devise: z.literal("EUR")
  }),
  conditions: z.object({
    validite_jours: z.number().int().positive().default(15),
    delai_fabrication_jours: z.number().int().positive().default(7)
  })
});

export const LivraisonSchema = z.object({
  intent: z.literal("LIVRAISON"),
  depart: z.string(),
  arrivee_cp: z.string().min(4),
  poids_kg: z.number().positive(),
  volume_m3: z.number().positive(),
  prix_estime_eur: z.number().nonnegative(),
  delai_jours: z.number().int().positive()
});
