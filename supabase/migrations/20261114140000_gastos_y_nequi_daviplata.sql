-- Gastos + Nequi/Daviplata.
-- Solo AGREGA cosas nuevas: no modifica ni borra datos existentes, así que
-- Body Positive (que comparte esta base) sigue funcionando igual.

-- 1) Nuevos métodos de pago (se corre solo, sin usarlos en este mismo script).
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'nequi';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'daviplata';

-- 2) Tabla de gastos (independiente de la caja y del inventario).
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  concept TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL DEFAULT 'otros',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method public.payment_method,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON public.expenses (category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede ver y registrar gastos;
-- solo un administrador puede corregirlos o borrarlos.
CREATE POLICY "read_expenses" ON public.expenses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_expenses" ON public.expenses
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admin_update_expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin_delete_expenses" ON public.expenses
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
