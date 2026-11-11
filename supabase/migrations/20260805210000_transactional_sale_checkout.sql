-- Wraps sale creation (header + items + payments + stock decrement + kardex)
-- in a single atomic transaction, replacing the ~6 sequential client-side
-- calls the POS checkout currently makes. If any step fails, everything
-- rolls back — no more "payment inserted but stock never decremented".
--
-- Runs as the calling user (no SECURITY DEFINER), so every write still goes
-- through the existing RLS policies on sales/sale_items/sale_payments/
-- products/inventory_movements — this only removes the multi-round-trip
-- risk, it does not change who is allowed to do what.
--
-- items shape:    [{ "product_id": uuid, "product_name": text, "barcode": text|null,
--                     "quantity": numeric, "unit_price": numeric, "unit_cost": numeric,
--                     "tax_rate": numeric, "discount": numeric }]
-- payments shape: [{ "method": text, "amount": numeric }]

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_cash_session_id UUID,
  p_customer_name TEXT,
  p_items JSONB,
  p_payments JSONB,
  p_change_amount NUMERIC DEFAULT 0
)
RETURNS TABLE (id UUID, number BIGINT)
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.complete_sale(UUID, TEXT, JSONB, JSONB, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale(UUID, TEXT, JSONB, JSONB, NUMERIC) TO authenticated;
