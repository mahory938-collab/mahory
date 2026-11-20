/**
 * Funciones comerciales de esta instalación.
 *
 * Se controlan aquí (o con la variable VITE_PLAN) y NO desde Configuración, para que el
 * cliente no pueda activarlas por su cuenta. El plan básico no incluye caja ni impresión
 * de recibos; con VITE_PLAN=pos vuelven a aparecer tal como estaban.
 */
const plan = import.meta.env["VITE_PLAN"] === "pos" ? "pos" : "basico";

export const FEATURES = {
  /** Apertura y cierre de caja, y el bloqueo de vender sin caja abierta. */
  caja: plan === "pos",
  /** Botones de imprimir recibo y cierre de caja. El recibo se sigue pudiendo ver. */
  impresion: plan === "pos",
} as const;
