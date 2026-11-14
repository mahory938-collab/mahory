import { createFileRoute } from "@tanstack/react-router";
import { Bike, Printer, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { printReceipt } from "@/features/sales/print-receipt";
import { ReturnItemsDialog } from "@/features/sales/return-items-dialog";
import type { SalesFilters, SalesRange, SaleStatus } from "@/features/sales/use-sales";
import {
  useDeleteSale,
  useReturnableItems,
  useSaleDetail,
  useSalesList,
  useVoidSale,
} from "@/features/sales/use-sales";
import { useStoreInfo } from "@/features/sales/use-store-info";
import { useReceiptSettings } from "@/features/settings/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/ventas")({
  head: () => ({
    meta: [
      { title: "Ventas — Mahory" },
      { name: "description", content: "Consulte, reimprima y anule ventas." },
      { property: "og:title", content: "Ventas — Mahory" },
      { property: "og:description", content: "Consulte, reimprima y anule ventas." },
    ],
  }),
  component: VentasPage,
});

const STATUS_LABELS: Record<SaleStatus, string> = {
  completada: "Completada",
  anulada: "Anulada",
  pendiente: "Pendiente",
  credito: "Crédito",
};

function statusVariant(status: SaleStatus): "secondary" | "destructive" | "outline" {
  if (status === "completada") return "secondary";
  if (status === "anulada") return "destructive";
  return "outline";
}

function VentasPage() {
  const { role } = useAuth();
  const canVoid = roleHasPermission(role, "pos.cancel_sale");

  const [filters, setFilters] = useState<SalesFilters>({
    range: "today",
    status: "all",
    search: "",
  });
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ id: string; number: number } | null>(null);
  const [returnTarget, setReturnTarget] = useState<{ id: string; number: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: number } | null>(null);

  const { data: sales, isLoading } = useSalesList(filters);

  return (
    <AppShell title="Ventas" description="Historial de ventas">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
              placeholder="Buscar por # de venta o cliente"
              className="h-10 rounded-xl pl-9"
            />
          </div>

          <Select
            value={filters.range}
            onValueChange={(value) => setFilters((f) => ({ ...f, range: value as SalesRange }))}
          >
            <SelectTrigger className="h-10 w-40 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Últimos 7 días</SelectItem>
              <SelectItem value="month">Últimos 30 días</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.status}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, status: value as SaleStatus | "all" }))
            }
          >
            <SelectTrigger className="h-10 w-44 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="completada">Completada</SelectItem>
              <SelectItem value="anulada">Anulada</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venta</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && sales?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    No hay ventas en este rango.
                  </TableCell>
                </TableRow>
              )}

              {sales?.map((sale) => (
                <TableRow
                  key={sale.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedSaleId(sale.id)}
                >
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      #{sale.number}
                      {sale.delivery_type === "domicilio" && (
                        <Bike className="size-3.5 text-primary" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(sale.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">{sale.customer_name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sale.cashier_name || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(sale.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(sale.status)} className="rounded-full">
                      {STATUS_LABELS[sale.status]}
                    </Badge>
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <SaleDetailDialog
        saleId={selectedSaleId}
        onOpenChange={(open) => !open && setSelectedSaleId(null)}
        canVoid={canVoid}
        onRequestVoid={(sale) => setVoidTarget(sale)}
        onRequestReturn={(sale) => setReturnTarget(sale)}
        onRequestDelete={(sale) => setDeleteTarget(sale)}
      />

      <ReturnItemsDialog
        saleId={returnTarget?.id ?? null}
        saleNumber={returnTarget?.number ?? null}
        onOpenChange={(open) => !open && setReturnTarget(null)}
      />

      <AlertDialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular venta #{voidTarget?.number}</AlertDialogTitle>
            <AlertDialogDescription>
              Se devolverá el stock de los productos vendidos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <VoidConfirmButton
              saleId={voidTarget?.id ?? null}
              onDone={() => {
                setVoidTarget(null);
                setSelectedSaleId(null);
              }}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar venta #{deleteTarget?.number}</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el registro por completo, no solo se marca como anulada. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <DeleteConfirmButton
              saleId={deleteTarget?.id ?? null}
              onDone={() => {
                setDeleteTarget(null);
                setSelectedSaleId(null);
              }}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function VoidConfirmButton({ saleId, onDone }: { saleId: string | null; onDone: () => void }) {
  const voidSale = useVoidSale();

  return (
    <AlertDialogAction
      className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
      disabled={voidSale.isPending}
      onClick={(event) => {
        event.preventDefault();
        if (!saleId) return;
        voidSale.mutate(saleId, {
          onSuccess: () => {
            toast.success("Venta anulada");
            onDone();
          },
          onError: (error: Error) => toast.error(error.message || "No se pudo anular la venta"),
        });
      }}
    >
      Anular venta
    </AlertDialogAction>
  );
}

function DeleteConfirmButton({ saleId, onDone }: { saleId: string | null; onDone: () => void }) {
  const deleteSale = useDeleteSale();

  return (
    <AlertDialogAction
      className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
      disabled={deleteSale.isPending}
      onClick={(event) => {
        event.preventDefault();
        if (!saleId) return;
        deleteSale.mutate(saleId, {
          onSuccess: () => {
            toast.success("Venta eliminada");
            onDone();
          },
          onError: (error: Error) => toast.error(error.message || "No se pudo eliminar la venta"),
        });
      }}
    >
      Eliminar venta
    </AlertDialogAction>
  );
}

function SaleDetailDialog({
  saleId,
  onOpenChange,
  canVoid,
  onRequestVoid,
  onRequestReturn,
  onRequestDelete,
}: {
  saleId: string | null;
  onOpenChange: (open: boolean) => void;
  canVoid: boolean;
  onRequestVoid: (sale: { id: string; number: number }) => void;
  onRequestReturn: (sale: { id: string; number: number }) => void;
  onRequestDelete: (sale: { id: string; number: number }) => void;
}) {
  const { data: sale, isLoading } = useSaleDetail(saleId);
  const { data: store } = useStoreInfo();
  const { data: receiptSettings } = useReceiptSettings();
  const { data: returnableItems } = useReturnableItems(saleId);

  const returnedAmount = (returnableItems ?? []).reduce(
    (sum, item) => sum + item.alreadyReturned * item.unitNetPrice,
    0,
  );
  const hasReturnableUnits = (returnableItems ?? []).some(
    (item) => item.quantity - item.alreadyReturned > 0,
  );

  return (
    <Dialog open={Boolean(saleId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sale ? `Venta #${sale.number}` : "Detalle de venta"}</DialogTitle>
        </DialogHeader>

        {isLoading || !sale ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{formatDateTime(sale.created_at)}</span>
              <Badge variant={statusVariant(sale.status)} className="rounded-full">
                {STATUS_LABELS[sale.status]}
              </Badge>
            </div>
            {sale.customer_name && <p className="text-sm">Cliente: {sale.customer_name}</p>}
            {sale.cashier_name && <p className="text-sm">Vendedor: {sale.cashier_name}</p>}
            {sale.delivery_type === "domicilio" && (
              <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary-soft/40 p-3 text-sm">
                <Bike className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">Domicilio</p>
                  <p className="text-muted-foreground">{sale.delivery_address || "Sin dirección"}</p>
                  {sale.delivery_fee > 0 && (
                    <p className="text-muted-foreground">
                      Costo de envío: {formatCurrency(sale.delivery_fee)}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="divide-y rounded-xl border">
              {sale.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} x {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 rounded-xl bg-surface p-3 text-sm">
              <Row label="Subtotal" value={formatCurrency(sale.subtotal)} />
              <Row label="IVA" value={formatCurrency(sale.tax_total)} />
              {sale.discount_total > 0 && (
                <Row label="Descuento" value={`-${formatCurrency(sale.discount_total)}`} />
              )}
              <Row label="Total" value={formatCurrency(sale.total)} bold />
              {returnedAmount > 0 && (
                <>
                  <Row label="Devuelto" value={`-${formatCurrency(returnedAmount)}`} />
                  <Row
                    label="Total neto"
                    value={formatCurrency(Math.max(0, sale.total - returnedAmount))}
                    bold
                  />
                </>
              )}
            </div>

            <div className="space-y-1.5 text-sm">
              {sale.payments.map((p) => (
                <Row key={p.id} label={p.method} value={formatCurrency(p.amount)} />
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={() => printReceipt(store, sale, receiptSettings?.widthMm)}
              >
                <Printer className="size-4" />
                Imprimir recibo
              </Button>
              {canVoid && (sale.status === "completada" || sale.status === "credito") && hasReturnableUnits && (
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl"
                  onClick={() => onRequestReturn({ id: sale.id, number: sale.number })}
                >
                  <RotateCcw className="size-4" />
                  Devolver productos
                </Button>
              )}
              {canVoid && sale.status === "completada" && (
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/5"
                  onClick={() => onRequestVoid({ id: sale.id, number: sale.number })}
                >
                  <Undo2 className="size-4" />
                  Anular venta
                </Button>
              )}
              {canVoid && sale.status === "anulada" && (
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/5"
                  onClick={() => onRequestDelete({ id: sale.id, number: sale.number })}
                >
                  <Trash2 className="size-4" />
                  Eliminar venta
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="capitalize text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
