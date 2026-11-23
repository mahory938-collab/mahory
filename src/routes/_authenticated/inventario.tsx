import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { History, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdjustStockDialog } from "@/features/inventory/adjust-stock-dialog";
import type { InventoryProduct, StockFilter } from "@/features/inventory/use-inventory";
import { useInventoryMovements, useInventoryProducts } from "@/features/inventory/use-inventory";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inventario")({
  // Un código leído desde otra pantalla llega aquí como ?buscar=...
  validateSearch: (search: Record<string, unknown>): { buscar?: string } =>
    typeof search["buscar"] === "string" && search["buscar"] ? { buscar: search["buscar"] } : {},
  head: () => ({
    meta: [
      { title: "Inventario — Mahory" },
      { name: "description", content: "Controle existencias, ajustes y kardex." },
      { property: "og:title", content: "Inventario — Mahory" },
      { property: "og:description", content: "Controle existencias, ajustes y kardex." },
    ],
  }),
  component: InventarioPage,
});

const MOVEMENT_LABELS: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  venta: "Venta",
  compra: "Compra",
  traslado: "Traslado",
  devolucion: "Devolución",
};

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "low", label: "Bajo stock" },
  { value: "out", label: "Agotados" },
];

function InventarioPage() {
  const { role } = useAuth();
  const canAdjust = roleHasPermission(role, "inventory.adjust");

  const [filter, setFilter] = useState<StockFilter>("all");
  const [search, setSearch] = useState("");
  const { buscar } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!buscar) return;
    setSearch(buscar);
    void navigate({ to: "/inventario", search: {}, replace: true });
  }, [buscar, navigate]);
  const [adjusting, setAdjusting] = useState<InventoryProduct | null>(null);
  const [kardexProductId, setKardexProductId] = useState<string | null>(null);

  const { data: products, isLoading } = useInventoryProducts(filter, search);
  const { data: movements, isLoading: movementsLoading } = useInventoryMovements(kardexProductId);
  const kardexProductName = products?.find((p) => p.id === kardexProductId)?.name ?? null;

  return (
    <AppShell title="Inventario" description="Stock y movimientos">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, código o SKU"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "default" : "outline"}
              className="h-10 rounded-xl"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && products?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                    No hay productos en este filtro.
                  </TableCell>
                </TableRow>
              )}

              {products?.map((product) => (
                <TableRow
                  key={product.id}
                  className={canAdjust ? "cursor-pointer" : undefined}
                  onClick={() => canAdjust && setAdjusting(product)}
                >
                  <TableCell>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.sku || product.barcode || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {product.category_name || "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      product.stock <= 0 && "text-destructive",
                      product.stock > 0 && product.stock <= product.min_stock && "text-warning",
                    )}
                  >
                    {formatNumber(product.stock)} {product.unit}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatNumber(product.min_stock)}
                  </TableCell>
                  <TableCell>
                    {product.stock <= 0 ? (
                      <Badge variant="destructive" className="rounded-full">
                        Agotado
                      </Badge>
                    ) : product.stock <= product.min_stock ? (
                      <Badge variant="outline" className="rounded-full border-warning/50 text-warning">
                        Stock bajo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="rounded-full">
                        Normal
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-lg"
                      onClick={() => setKardexProductId(product.id)}
                    >
                      <History className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="rounded-2xl shadow-soft">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {kardexProductName ? `Kardex — ${kardexProductName}` : "Movimientos recientes"}
            </CardTitle>
            {kardexProductId && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => setKardexProductId(null)}
              >
                Ver todos
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {movementsLoading ? (
              <Skeleton className="h-32 rounded-xl" />
            ) : (movements?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay movimientos registrados.
              </p>
            ) : (
              <div className="divide-y">
                {movements?.map((movement) => (
                  <div key={movement.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {movement.product_name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {MOVEMENT_LABELS[movement.type] ?? movement.type}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(movement.created_at)}
                        {movement.reason ? ` · ${movement.reason}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm text-muted-foreground">
                      {formatNumber(movement.stock_before)} → {formatNumber(movement.stock_after)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canAdjust && (
        <AdjustStockDialog
          product={adjusting}
          onOpenChange={(open) => !open && setAdjusting(null)}
        />
      )}
    </AppShell>
  );
}
