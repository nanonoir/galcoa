import { z } from "zod";

/**
 * Contenido de la landing y la navegación (MVP-114; PRD REQ-02, §5, §11).
 * Los enlaces son datos provistos por el líder: la presentación no importa
 * `next/link`. Solo se admiten destinos internos (`/ruta`) o anclas (`#id`).
 */
const InternalHrefSchema = z
  .string()
  .regex(/^(\/(?!\/)|#)\S*$/, "Solo rutas internas o anclas");

export const NavLinkSchema = z.strictObject({
  label: z.string().min(1),
  href: InternalHrefSchema,
});

export const LandingFeatureSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1),
});

/** Anuncio de una función futura: se muestra como «Próximamente», nunca como función disponible. */
export const LandingUpcomingSchema = z.strictObject({
  label: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  example: z.string().min(1),
  disclaimer: z.string().min(1),
});

export const LandingContentSchema = z.strictObject({
  brand: z.string().min(1),
  navigation: z.array(NavLinkSchema).min(1),
  primaryAction: NavLinkSchema,
  heading: z.string().min(1),
  summary: z.string().min(1),
  features: z.array(LandingFeatureSchema).min(1),
  /** Límites del alcance, visibles para no prometer de más (PRD §1, §11). */
  limits: z.array(z.string().min(1)),
  upcoming: LandingUpcomingSchema.optional(),
});

export type NavLink = z.infer<typeof NavLinkSchema>;
export type LandingUpcoming = z.infer<typeof LandingUpcomingSchema>;
export type LandingFeature = z.infer<typeof LandingFeatureSchema>;
export type LandingContent = z.infer<typeof LandingContentSchema>;
