-- Dedicated ledger for customer debt payments ("abonos"), independent of
-- cash_movements. Today an abono only leaves a trail when paid in cash AND
-- there's an open cash session — non-cash abonos (transferencia/tarjeta/otro)
-- and abonos with no open drawer vanish with nothing but the balance change.
-- This table records every abono regardless of method or session state, so
-- Dashboard/Reportes can show "abonos del día/rango" reliably.
CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  method public.payment_method NOT NULL,
  note TEXT,
  cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_customer_payments" ON public.customer_payments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_customer_payments" ON public.customer_payments
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
