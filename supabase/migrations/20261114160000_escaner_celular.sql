-- =====================================================================
-- ESCÁNER DE CELULAR: el celular lee el código de barras con la cámara y
-- lo manda al computador (POS) en tiempo real.
-- Solo AGREGA tablas nuevas; no toca ventas, productos ni inventario.
-- Se corre una sola vez en el SQL Editor de Supabase (proyecto de Mahory).
-- =====================================================================

-- 1) Sesión de escaneo: una por computador/usuario, dura 12 horas.
CREATE TABLE IF NOT EXISTS public.scanner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS scanner_sessions_owner_idx ON public.scanner_sessions (owner_id, created_at DESC);

-- 2) Códigos de pareamiento temporales (se guardan SOLO como hash; vencen en 5 minutos y sirven una vez).
CREATE TABLE IF NOT EXISTS public.scanner_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scanner_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Celulares conectados (la llave secreta del celular se guarda SOLO como hash).
CREATE TABLE IF NOT EXISTS public.scanner_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.scanner_sessions(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  secret_hash text NOT NULL,
  paired_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz
);
CREATE INDEX IF NOT EXISTS scanner_devices_session_idx ON public.scanner_devices (session_id);

-- 4) Escaneos. event_id lo genera el celular: si un reintento llega dos veces, solo se guarda una.
CREATE TABLE IF NOT EXISTS public.scan_events (
  event_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.scanner_sessions(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.scanner_devices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  found boolean NOT NULL DEFAULT false,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  unit_price numeric(14,2),
  image_url text,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_events_session_idx ON public.scan_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_events_device_barcode_idx ON public.scan_events (device_id, barcode, created_at DESC);

-- 5) Seguridad: nadie del navegador escribe aquí; solo el servidor (service_role).
ALTER TABLE public.scanner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scanner_sessions, public.scanner_pairings, public.scanner_devices, public.scan_events
  FROM anon, authenticated;
GRANT ALL ON public.scanner_sessions, public.scanner_pairings, public.scanner_devices, public.scan_events
  TO service_role;

-- El dueño (o un administrador) puede VER sus sesiones, celulares y escaneos.
GRANT SELECT ON public.scanner_sessions, public.scanner_devices, public.scan_events TO authenticated;
CREATE POLICY read_own_scanner_sessions ON public.scanner_sessions FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY read_own_scanner_devices ON public.scanner_devices FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY read_own_scan_events ON public.scan_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- El POS "reclama" cada escaneo marcándolo como usado; es lo único que puede modificar.
GRANT UPDATE (consumed_at) ON public.scan_events TO authenticated;
CREATE POLICY consume_own_scan_events ON public.scan_events FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 6) Tiempo real: avisar al POS cuando llega un escaneo o cambia un celular.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'scan_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'scanner_devices') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scanner_devices;
  END IF;
END $$;
