-- One-time backfill: products created before investment tracking existed
-- never left an "initial stock" kardex entry. Approximate their original
-- investment as current cost × current stock, dated at product creation.
-- Only touches products with stock > 0 that don't already have a
-- product_creation entry (safe to re-run).
INSERT INTO public.inventory_movements
  (product_id, type, quantity, stock_before, stock_after, unit_cost, reason, reference_type, created_at)
SELECT
  p.id,
  'entrada',
  p.stock,
  0,
  p.stock,
  p.cost,
  'Stock inicial (registro retroactivo)',
  'product_creation',
  p.created_at
FROM public.products p
WHERE p.stock > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_movements im
    WHERE im.product_id = p.id AND im.reference_type = 'product_creation'
  );
