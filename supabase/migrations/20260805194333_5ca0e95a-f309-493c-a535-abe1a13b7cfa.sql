-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','vendedor');
CREATE TYPE public.product_status AS ENUM ('active','inactive');
CREATE TYPE public.movement_type AS ENUM ('entrada','salida','ajuste','venta','compra','traslado','devolucion');
CREATE TYPE public.sale_status AS ENUM ('completada','anulada','pendiente','credito');
CREATE TYPE public.payment_method AS ENUM ('efectivo','tarjeta','transferencia','credito','otro');
CREATE TYPE public.purchase_status AS ENUM ('borrador','recibida','anulada');
CREATE TYPE public.cash_session_status AS ENUM ('abierta','cerrada');
CREATE TYPE public.cash_movement_type AS ENUM ('ingreso','egreso','venta','apertura','cierre');
CREATE TYPE public.delivery_type AS ENUM ('mostrador','domicilio');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ STORES ============
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  currency TEXT NOT NULL DEFAULT 'COP',
  default_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  logo_url TEXT,
  receipt_footer TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'));
$$;

CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1;
$$;

-- first user becomes super_admin, rest vendedor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE default_store UUID; user_count INT;
BEGIN
  SELECT id INTO default_store FROM public.stores ORDER BY created_at LIMIT 1;
  INSERT INTO public.profiles (id, full_name, email, store_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, default_store);
  SELECT count(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'super_admin'::public.app_role ELSE 'vendedor'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CATALOG ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_id TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_type TEXT DEFAULT 'CC',
  document_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  description TEXT,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'UND',
  image_url TEXT,
  status public.product_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_barcode_unique ON public.products (store_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_name_idx ON public.products (name);
CREATE INDEX products_sku_idx ON public.products (sku);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============ INVENTORY ============
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.movement_type NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  stock_before NUMERIC(14,3) NOT NULL DEFAULT 0,
  stock_after NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2),
  reason TEXT,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON public.inventory_movements (product_id, created_at DESC);
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- ============ PURCHASES ============
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  number BIGSERIAL,
  status public.purchase_status NOT NULL DEFAULT 'borrador',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- ============ CASH ============
CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.cash_session_status NOT NULL DEFAULT 'abierta',
  opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_amount NUMERIC(14,2),
  difference NUMERIC(14,2),
  notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

-- ============ SALES ============
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  number BIGSERIAL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  status public.sale_status NOT NULL DEFAULT 'completada',
  delivery_type public.delivery_type NOT NULL DEFAULT 'mostrador',
  delivery_address TEXT,
  delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_held BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_created_idx ON public.sales (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  barcode TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type public.cash_movement_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  concept TEXT,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

-- ============ SETTINGS ============
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
-- read for all authenticated
CREATE POLICY "read_stores" ON public.stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_stores" ON public.stores FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "read_own_or_admin_profiles" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admin_manage_profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "read_own_roles_or_admin" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "read_categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "read_brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_brands" ON public.brands FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "read_suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_suppliers" ON public.suppliers FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "read_customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_customers" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_delete_customers" ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "read_products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "update_products" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_insert_products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin_delete_products" ON public.products FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "read_movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "read_purchases" ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_purchases" ON public.purchases FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "read_purchase_items" ON public.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_purchase_items" ON public.purchase_items FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "read_cash_sessions" ON public.cash_sessions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "insert_own_cash_session" ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_cash_session" ON public.cash_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "read_cash_movements" ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_cash_movements" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "read_sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (cashier_id = auth.uid());
CREATE POLICY "update_sales" ON public.sales FOR UPDATE TO authenticated USING (cashier_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (cashier_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin_delete_sales" ON public.sales FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "read_sale_items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_sale_items" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_sale_payments" ON public.sale_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_sale_payments" ON public.sale_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_settings" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ TRIGGERS updated_at ============
CREATE TRIGGER t_stores_upd BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_categories_upd BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_brands_upd BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_suppliers_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_customers_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_purchases_upd BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_sales_upd BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED: default store + demo catalog ============
INSERT INTO public.stores (id, name, legal_name, tax_id, address, phone, city, receipt_footer)
VALUES ('11111111-1111-1111-1111-111111111111','Mi Tienda','Mi Tienda S.A.S.','900123456-1','Calle 10 # 20-30','3001234567','Bogotá','¡Gracias por su compra!');

INSERT INTO public.categories (id, store_id, name) VALUES
('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Ropa'),
('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Calzado'),
('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Accesorios'),
('22222222-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Hogar'),
('22222222-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Papelería'),
('22222222-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Juguetería'),
('22222222-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','Cosméticos'),
('22222222-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','Víveres');

INSERT INTO public.brands (id, store_id, name) VALUES
('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Genérica'),
('33333333-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Nacional');

INSERT INTO public.customers (id, store_id, name, document_number, phone) VALUES
('44444444-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Consumidor Final','222222222222',NULL),
('44444444-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','María Gómez','1020304050','3109876543');

INSERT INTO public.products (store_id, name, barcode, sku, category_id, brand_id, cost, price, wholesale_price, stock, min_stock) VALUES
('11111111-1111-1111-1111-111111111111','Camiseta básica blanca','7701001000011','ROP-001','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001',18000,39900,32000,42,10),
('11111111-1111-1111-1111-111111111111','Jean clásico azul','7701001000028','ROP-002','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001',45000,99900,80000,18,6),
('11111111-1111-1111-1111-111111111111','Tenis deportivos','7701001000035','CAL-001','22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000002',72000,159900,130000,9,10),
('11111111-1111-1111-1111-111111111111','Sandalias dama','7701001000042','CAL-002','22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000001',22000,49900,40000,25,8),
('11111111-1111-1111-1111-111111111111','Gorra ajustable','7701001000059','ACC-001','22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000001',12000,29900,24000,3,10),
('11111111-1111-1111-1111-111111111111','Juego de sábanas doble','7701001000066','HOG-001','22222222-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000002',55000,119900,98000,12,5),
('11111111-1111-1111-1111-111111111111','Cuaderno cuadriculado 100h','7701001000073','PAP-001','22222222-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000001',2500,5900,4500,120,30),
('11111111-1111-1111-1111-111111111111','Bolígrafo negro','7701001000080','PAP-002','22222222-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000001',700,1800,1200,300,50),
('11111111-1111-1111-1111-111111111111','Carro de juguete','7701001000097','JUG-001','22222222-0000-0000-0000-000000000006','33333333-0000-0000-0000-000000000001',9000,24900,19000,0,5),
('11111111-1111-1111-1111-111111111111','Labial mate','7701001000103','COS-001','22222222-0000-0000-0000-000000000007','33333333-0000-0000-0000-000000000002',8000,22900,18000,34,10),
('11111111-1111-1111-1111-111111111111','Crema hidratante 200ml','7701001000110','COS-002','22222222-0000-0000-0000-000000000007','33333333-0000-0000-0000-000000000002',14000,34900,28000,16,6),
('11111111-1111-1111-1111-111111111111','Arroz 500g','7701001000127','VIV-001','22222222-0000-0000-0000-000000000008','33333333-0000-0000-0000-000000000002',2200,3500,2900,80,20),
('11111111-1111-1111-1111-111111111111','Aceite vegetal 1L','7701001000134','VIV-002','22222222-0000-0000-0000-000000000008','33333333-0000-0000-0000-000000000002',8500,12900,11000,45,15),
('11111111-1111-1111-1111-111111111111','Detergente en polvo 1kg','7701001000141','HOG-002','22222222-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000002',7000,13900,11500,2,10);