/**
 * Funciones comerciales de esta instalación.
 *
 * Se controlan aquí (o con la variable VITE_PLAN) y NO desde Configuración, para que el
 * cliente no pueda cambiarlas por su cuenta.
 *   - Por defecto (plan "pos"): caja e impresión de recibos activas.
 *   - VITE_PLAN=basico: se esconde la caja y se quitan los botones de imprimir; el recibo
 *     se sigue pudiendo ver en pantalla.
 */
const plan = import.meta.env["VITE_PLAN"] === "basico" ? "basico" : "pos";

export const FEATURES = {
  /** Apertura y cierre de caja, y el bloqueo de vender sin caja abierta. */
  caja: plan === "pos",
  /** Botones de imprimir recibo y cierre de caja. */
  impresion: plan === "pos",
} as const;
