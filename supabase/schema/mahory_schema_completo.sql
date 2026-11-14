-- =====================================================================
-- MAHORY POS — base de datos completa para un proyecto Supabase NUEVO.
-- Generado a partir de la estructura real de Body Positive, más:
--   * Nequi y Daviplata como métodos de pago
--   * tabla de gastos (expenses)
-- Se corre UNA sola vez, completo, en el SQL Editor del proyecto nuevo.
-- No incluye datos (productos, ventas, usuarios): arranca vacío.
-- =====================================================================

SET check_function_bodies = off;

-- 1) TIPOS -------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'vendedor');
CREATE TYPE public.cash_movement_type AS ENUM ('ingreso', 'egreso', 'venta', 'apertura', 'cierre');
CREATE TYPE public.cash_session_status AS ENUM ('abierta', 'cerrada');
CREATE TYPE public.delivery_type AS ENUM ('mostrador', 'domicilio');
CREATE TYPE public.movement_type AS ENUM ('entrada', 'salida', 'ajuste', 'venta', 'compra', 'traslado', 'devolucion');
CREATE TYPE public.payment_method AS ENUM ('efectivo', 'tarjeta', 'transferencia', 'credito', 'otro', 'nequi', 'daviplata');
CREATE TYPE public.product_status AS ENUM ('active', 'inactive');
CREATE TYPE public.purchase_status AS ENUM ('borrador', 'recibida', 'anulada');
CREATE TYPE public.sale_status AS ENUM ('completada', 'anulada', 'pendiente', 'credito');

-- 2) SECUENCIAS (numeración de ventas y compras) -----------------------
CREATE SEQUENCE public.sales_number_seq;
CREATE SEQUENCE public.purchases_number_seq;

-- 3) TABLAS ------------------------------------------------------------
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  tax_id text,
  address text,
  phone text,
  email text,
  city text,
  currency text NOT NULL DEFAULT 'COP',
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 19,
  logo_url text,
  receipt_footer text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, key)
);

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text DEFAULT 'CC',
  document_number text,
  phone text,
  email text,
  address text,
  city text,
  notes text,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  avatar_url text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  barcode text,
  sku text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  description text,
  cost numeric(14,2) NOT NULL DEFAULT 0,
  price numeric(14,2) NOT NULL DEFAULT 0,
  wholesale_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 19,
  stock numeric(14,3) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'UND',
  image_url text,
  status public.product_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.cash_session_status NOT NULL DEFAULT 'abierta',
  opening_amount numeric(14,2) NOT NULL DEFAULT 0,
  expected_amount numeric(14,2) NOT NULL DEFAULT 0,
  counted_amount numeric(14,2),
  difference numeric(14,2),
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  number bigint NOT NULL DEFAULT nextval('public.sales_number_seq'),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  status public.sale_status NOT NULL DEFAULT 'completada',
  delivery_type public.delivery_type NOT NULL DEFAULT 'mostrador',
  delivery_address text,
  delivery_fee numeric(14,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  cost_total numeric(14,2) NOT NULL DEFAULT 0,
  paid_total numeric(14,2) NOT NULL DEFAULT 0,
  change_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  is_held boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.sales_number_seq OWNED BY public.sales.number;

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  barcode text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type public.cash_movement_type NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  concept text,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  method public.payment_method NOT NULL,
  note text,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.movement_type NOT NULL,
  quantity numeric(14,3) NOT NULL,
  stock_before numeric(14,3) NOT NULL DEFAULT 0,
  stock_after numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2),
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  number bigint NOT NULL DEFAULT nextval('public.purchases_number_seq'),
  status public.purchase_status NOT NULL DEFAULT 'borrador',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  received_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.purchases_number_seq OWNED BY public.purchases.number;

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NUEVO: gastos (independiente de la caja y del inventario)
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  concept text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  category text NOT NULL DEFAULT 'otros',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method public.payment_method,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) ÍNDICES -----------------------------------------------------------
CREATE INDEX inventory_movements_product_idx ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX products_name_idx ON public.products (name);
CREATE INDEX products_sku_idx ON public.products (sku);
CREATE INDEX sales_created_idx ON public.sales (created_at DESC);
CREATE UNIQUE INDEX products_barcode_unique ON public.products (store_id, barcode) WHERE (barcode IS NOT NULL);
CREATE INDEX expenses_date_idx ON public.expenses (expense_date DESC);
CREATE INDEX expenses_category_idx ON public.expenses (category);

-- 5) FUNCIONES ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'));
$function$;

CREATE OR REPLACE FUNCTION public.current_role_name()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

-- Al registrarse un usuario: crea su perfil y su rol.
-- El PRIMER usuario del sistema queda como super_admin; los demás, vendedor.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE default_store UUID; user_count INT;
BEGIN
  SELECT id INTO default_store FROM public.stores ORDER BY created_at LIMIT 1;
  INSERT INTO public.profiles (id, full_name, email, store_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, default_store);
  SELECT count(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'super_admin'::public.app_role ELSE 'vendedor'::public.app_role END);
  RETURN NEW;
END; $function$;

-- Cobro transaccional: crea la venta, sus productos y pagos, y descuenta
-- inventario en un solo paso (si algo falla, no se guarda nada).
CREATE OR REPLACE FUNCTION public.complete_sale(p_cash_session_id uuid, p_customer_name text, p_items jsonb, p_payments jsonb, p_change_amount numeric DEFAULT 0)
 RETURNS TABLE(id uuid, number bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id UUID;
  v_subtotal NUMERIC := 0;
  v_tax_total NUMERIC := 0;
  v_discount_total NUMERIC := 0;
  v_total NUMERIC := 0;
  v_paid_total NUMERIC := 0;
  v_cost_total NUMERIC := 0;
  v_has_credito BOOLEAN := false;
  v_item JSONB;
  v_stock_before NUMERIC;
  v_stock_after NUMERIC;
  v_line_total NUMERIC;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos';
  END IF;

  -- Totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_total := GREATEST(
      0,
      (v_item->>'unit_price')::NUMERIC * (v_item->>'quantity')::NUMERIC - (v_item->>'discount')::NUMERIC
    );
    v_subtotal := v_subtotal + v_line_total;
    v_tax_total := v_tax_total
      + v_line_total * ((v_item->>'tax_rate')::NUMERIC / 100) / (1 + (v_item->>'tax_rate')::NUMERIC / 100);
    v_discount_total := v_discount_total + (v_item->>'discount')::NUMERIC;
    v_cost_total := v_cost_total + (v_item->>'unit_cost')::NUMERIC * (v_item->>'quantity')::NUMERIC;
  END LOOP;
  v_subtotal := v_subtotal - v_tax_total;
  v_total := v_subtotal + v_tax_total;

  SELECT COALESCE(SUM((p->>'amount')::NUMERIC), 0), bool_or(p->>'method' = 'credito')
  INTO v_paid_total, v_has_credito
  FROM jsonb_array_elements(p_payments) AS p;

  IF v_paid_total < v_total THEN
    RAISE EXCEPTION 'El pago no cubre el total de la venta';
  END IF;

  INSERT INTO public.sales (
    cashier_id, cash_session_id, customer_name, subtotal, tax_total,
    discount_total, total, paid_total, cost_total, change_amount, status
  ) VALUES (
    auth.uid(), p_cash_session_id, NULLIF(p_customer_name, ''), ROUND(v_subtotal),
    ROUND(v_tax_total), ROUND(v_discount_total), ROUND(v_total), ROUND(v_paid_total),
    ROUND(v_cost_total), ROUND(p_change_amount),
    CASE WHEN v_has_credito THEN 'credito' ELSE 'completada' END
  )
  RETURNING sales.id INTO v_sale_id;

  INSERT INTO public.sale_items (
    sale_id, product_id, product_name, barcode, quantity, unit_price,
    unit_cost, tax_rate, discount, total
  )
  SELECT
    v_sale_id,
    (item->>'product_id')::UUID,
    item->>'product_name',
    item->>'barcode',
    (item->>'quantity')::NUMERIC,
    (item->>'unit_price')::NUMERIC,
    (item->>'unit_cost')::NUMERIC,
    (item->>'tax_rate')::NUMERIC,
    (item->>'discount')::NUMERIC,
    GREATEST(0, (item->>'unit_price')::NUMERIC * (item->>'quantity')::NUMERIC - (item->>'discount')::NUMERIC)
  FROM jsonb_array_elements(p_items) AS item;

  INSERT INTO public.sale_payments (sale_id, method, amount)
  SELECT v_sale_id, (p->>'method')::public.payment_method, (p->>'amount')::NUMERIC
  FROM jsonb_array_elements(p_payments) AS p
  WHERE (p->>'amount')::NUMERIC > 0;

  -- Stock decrement + kardex, one product row at a time, locked to avoid
  -- two concurrent sales racing on the same product's stock.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT stock INTO v_stock_before
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    v_stock_after := GREATEST(0, v_stock_before - (v_item->>'quantity')::NUMERIC);

    UPDATE public.products SET stock = v_stock_after WHERE id = (v_item->>'product_id')::UUID;

    INSERT INTO public.inventory_movements (
      product_id, type, quantity, stock_before, stock_after, unit_cost,
      reference_type, reference_id, created_by
    ) VALUES (
      (v_item->>'product_id')::UUID, 'venta', (v_item->>'quantity')::NUMERIC,
      v_stock_before, v_stock_after, (v_item->>'unit_cost')::NUMERIC,
      'sale', v_sale_id, auth.uid()
    );
  END LOOP;

  RETURN QUERY SELECT v_sale_id, sales.number FROM public.sales WHERE sales.id = v_sale_id;
END;
$function$;

-- 6) TRIGGERS ----------------------------------------------------------
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER t_brands_upd BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_categories_upd BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_customers_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_purchases_upd BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_sales_upd BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_stores_upd BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_suppliers_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) SEGURIDAD POR FILAS (RLS) ------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a usuarios autenticados
CREATE POLICY read_brands ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY read_cash_movements ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY read_cash_sessions ON public.cash_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY read_categories ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY read_customer_payments ON public.customer_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY read_customers ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY read_expenses ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY read_movements ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY read_products ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY read_purchase_items ON public.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY read_purchases ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY read_sale_items ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY read_sale_payments ON public.sale_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY read_sales ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY read_settings ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY read_stores ON public.stores FOR SELECT TO authenticated USING (true);
CREATE POLICY read_suppliers ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY read_own_or_admin_profiles ON public.profiles FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR public.is_admin(auth.uid())));
CREATE POLICY read_own_roles_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));

-- Solo administradores
CREATE POLICY admin_delete_customers ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY admin_delete_products ON public.products FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY admin_delete_sales ON public.sales FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY admin_insert_products ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_manage_profiles ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_brands ON public.brands FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_categories ON public.categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_purchase_items ON public.purchase_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_purchases ON public.purchases FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_settings ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_stores ON public.stores FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_write_suppliers ON public.suppliers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_update_expenses ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY admin_delete_expenses ON public.expenses FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Escritura de uso diario (ventas, caja, inventario, clientes)
CREATE POLICY insert_cash_movements ON public.cash_movements FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY insert_customer_payments ON public.customer_payments FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY insert_customers ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY insert_expenses ON public.expenses FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY insert_movements ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY insert_own_cash_session ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY insert_sales ON public.sales FOR INSERT TO authenticated WITH CHECK ((cashier_id = auth.uid()));
CREATE POLICY update_cash_sessions ON public.cash_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY update_customers ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY update_own_profile ON public.profiles FOR UPDATE TO authenticated
  USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY update_products ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY update_sales ON public.sales FOR UPDATE TO authenticated
  USING (((cashier_id = auth.uid()) OR public.is_admin(auth.uid())))
  WITH CHECK (((cashier_id = auth.uid()) OR public.is_admin(auth.uid())));
CREATE POLICY write_sale_items ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY write_sale_payments ON public.sale_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8) PERMISOS (igual que Body Positive; la seguridad real la dan las políticas) --
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 9) CARPETA DE FOTOS DE PRODUCTOS ------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 10) TIENDA INICIAL (debe existir ANTES de registrar el primer usuario) --
INSERT INTO public.stores (name, city, receipt_footer)
VALUES ('Mahory', 'Bogotá', '¡Gracias por su compra!');
