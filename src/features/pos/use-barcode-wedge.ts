import { useEffect, useRef } from "react";

/** Entre una tecla y otra de un lector pasan pocos milisegundos; una persona tarda mucho más. */
const MAX_GAP_MS = 80;
/** Con Enter al final basta con 4 caracteres. */
const MIN_LENGTH = 4;
/** Algunos lectores no mandan Enter: si dejan de teclear y hay un código completo, se toma igual. */
const IDLE_FLUSH_MS = 120;
const MIN_LENGTH_WITHOUT_ENTER = 8;

/**
 * Lector de código de barras de escritorio (USB o Bluetooth): se comporta como un teclado y
 * "escribe" el código seguido de Enter. Esto lo recibe aunque el cursor no esté en el campo de
 * búsqueda; si el cursor ya está en un campo de texto o hay una ventana abierta, no interviene.
 */
export function useBarcodeWedge(onScan: (code: string) => void) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let buffer = "";
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reset = () => {
      buffer = "";
    };
    const flush = () => {
      const code = buffer;
      reset();
      if (code.length >= MIN_LENGTH) onScanRef.current(code);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      clearTimeout(timer);

      if (event.key === "Enter" || event.key === "Tab") {
        if (buffer.length >= MIN_LENGTH) {
          event.preventDefault();
          flush();
        } else {
          reset();
        }
        return;
      }
      if (event.key.length !== 1) return;

      const now = performance.now();
      if (buffer && now - last > MAX_GAP_MS) reset();
      buffer += event.key;
      last = now;

      timer = setTimeout(() => {
        if (buffer.length >= MIN_LENGTH_WITHOUT_ENTER) flush();
        else reset();
      }, IDLE_FLUSH_MS);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timer);
    };
  }, []);
}
