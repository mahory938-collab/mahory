-- Modos del escáner de celular: "ventas" (manda el producto al carrito del POS)
-- y "consulta" (solo muestra precio y existencias en el celular).
-- El modo se guarda en el SERVIDOR: aunque la pantalla del celular falle, un celular
-- en "consulta" nunca puede mandar productos al carrito.
-- Solo agrega una columna; se puede correr más de una vez sin problema.

ALTER TABLE public.scanner_devices
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'ventas';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scanner_devices_mode_check'
  ) THEN
    ALTER TABLE public.scanner_devices
      ADD CONSTRAINT scanner_devices_mode_check CHECK (mode IN ('ventas', 'consulta'));
  END IF;
END $$;
