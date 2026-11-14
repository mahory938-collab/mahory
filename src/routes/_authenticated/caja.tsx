import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethodBreakdown } from "@/features/cash/use-cash";
import {
  useActiveCashSession,
  useAddCashMovement,
  useCashMovements,
  useCashSessionSummary,
  useCloseCash,
  useOpenCash,
} from "@/features/cash/use-cash";
import { printCashClose } from "@/features/cash/print-cash-close";
import { useReceiptSettings } from "@/features/settings/use-settings";
import { useStoreInfo } from "@/features/sales/use-store-info";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/caja")({
  head: () => ({
    meta: [
      { title: "Caja — Mahory" },
      { name: "description", content: "Controle el efectivo de cada turno." },
      { property: "og:title", content: "Caja — Mahory" },
      { property: "og:description", content: "Controle el efectivo de cada turno." },
    ],
  }),
  component: CajaPage,
});

const PAYMENT_METHOD_LABELS: { key: keyof PaymentMethodBreakdown; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "tarjeta", label: "Tarjeta" },
  { key: "transferencia", label: "Transferencia" },
  { key: "credito", label: "Crédito" },
  { key: "otro", label: "Otro" },
];

function CajaPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: session, isLoading: sessionLoading } = useActiveCashSession();

  return (
    <AppShell title="Caja" description="Apertura y cierre de caja">
      {authLoading || sessionLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : session ? (
        <OpenSession
          sessionId={session.id}
          openingAmount={session.opening_amount}
          openedByName={session.openedByName}
          openedAt={session.opened_at}
        />
      ) : (
        <OpenCashCard userId={user?.id ?? null} />
      )}
    </AppShell>
  );
}

function OpenCashCard({ userId }: { userId: string | null }) {
  const [amount, setAmount] = useState("");
  const openCash = useOpenCash(userId);

  const submit = () => {
    const value = Number(amount.replace(/[^\d]/g, "")) || 0;
    openCash.mutate(value, {
      onSuccess: () => toast.success("Caja abierta"),
      onError: (error: Error) => toast.error(error.message || "No se pudo abrir la caja"),
    });
  };

  return (
    <Card className="mx-auto max-w-md rounded-2xl shadow-soft">
      <CardHeader>
        <div className="grid size-12 place-items-center rounded-xl bg-primary-soft">
          <Wallet className="size-6 text-primary" />
        </div>
        <CardTitle className="mt-3 text-lg">Abrir caja</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ingrese la base inicial en efectivo. La caja es única para toda la tienda: quedará
          abierta para todo el equipo, en cualquier equipo, hasta que alguien la cierre.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Base inicial</Label>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="h-12 rounded-xl text-right text-lg"
          />
        </div>
        <Button
          className="h-11 w-full rounded-xl"
          disabled={openCash.isPending}
          onClick={submit}
        >
          {openCash.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Abrir caja
        </Button>
      </CardContent>
    </Card>
  );
}

function OpenSession({
  sessionId,
  openingAmount,
  openedByName,
  openedAt,
}: {
  sessionId: string;
  openingAmount: number;
  openedByName: string | null;
  openedAt: string;
}) {
  const { data: summary, isLoading: summaryLoading } = useCashSessionSummary(sessionId);
  const { data: movements, isLoading: movementsLoading } = useCashMovements(sessionId);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const ingresos = (movements ?? [])
    .filter((m) => m.type === "ingreso")
    .reduce((sum, m) => sum + m.amount, 0);
  const egresos = (movements ?? [])
    .filter((m) => m.type === "egreso")
    .reduce((sum, m) => sum + m.amount, 0);
  const cashSales = summary?.cashSales ?? 0;
  const abonosCash = summary?.abonosCash ?? 0;
  const expected = openingAmount + cashSales + abonosCash + ingresos - egresos;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="rounded-full">Caja abierta</Badge>
          {openedByName && (
            <span className="text-sm text-muted-foreground">Abierta por {openedByName}</span>
          )}
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => setMovementOpen(true)}>
          Registrar movimiento
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Base inicial" value={formatCurrency(openingAmount)} />
        <SummaryCard
          label="Ventas totales"
          value={formatCurrency(summary?.salesTotal ?? 0)}
          hint={summaryLoading ? undefined : `${summary?.salesCount ?? 0} ventas`}
        />
        <SummaryCard label="Abonos" value={formatCurrency(abonosCash)} tone="up" />
        <SummaryCard label="Ingresos" value={formatCurrency(ingresos)} tone="up" />
        <SummaryCard label="Egresos" value={formatCurrency(egresos)} tone="down" />
        <SummaryCard label="Esperado en caja" value={formatCurrency(expected)} highlight />
      </div>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ventas por método de pago</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {summaryLoading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {PAYMENT_METHOD_LABELS.map(({ key, label }) => (
                <div key={key} className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-base font-semibold">
                    {formatCurrency(summary?.byMethod[key] ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimientos del turno</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {movementsLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (movements?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay ingresos ni egresos registrados en este turno.
            </p>
          ) : (
            <div className="divide-y">
              {movements?.map((movement) => {
                const isIncome = movement.type === "ingreso" || movement.type === "apertura";
                const isOutcome = movement.type === "egreso";
                const defaultLabel =
                  movement.type === "apertura"
                    ? "Apertura de caja"
                    : movement.type === "ingreso"
                      ? "Ingreso"
                      : movement.type === "egreso"
                        ? "Egreso"
                        : movement.type;

                return (
                  <div key={movement.id} className="flex items-center gap-3 py-3">
                    <div
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        movement.type === "apertura"
                          ? "bg-primary-soft"
                          : isIncome
                            ? "bg-success/15"
                            : "bg-destructive/10",
                      )}
                    >
                      {movement.type === "apertura" ? (
                        <Wallet className="size-4 text-primary" />
                      ) : isOutcome ? (
                        <ArrowDownCircle className="size-4 text-destructive" />
                      ) : (
                        <ArrowUpCircle className="size-4 text-success" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {movement.concept || defaultLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(movement.created_at)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "font-display text-sm font-semibold",
                        movement.type === "apertura"
                          ? "text-foreground"
                          : isOutcome
                            ? "text-destructive"
                            : "text-success",
                      )}
                    >
                      {movement.type === "apertura" ? "" : isOutcome ? "-" : "+"}
                      {formatCurrency(movement.amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full rounded-xl border-destructive/40 text-destructive hover:bg-destructive/5"
        onClick={() => setCloseOpen(true)}
      >
        Cerrar caja
      </Button>

      <MovementDialog open={movementOpen} onOpenChange={setMovementOpen} sessionId={sessionId} />
      <CloseCashDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        sessionId={sessionId}
        expected={expected}
        openingAmount={openingAmount}
        openedAt={openedAt}
        openedByName={openedByName}
        byMethod={summary?.byMethod}
        abonosCash={abonosCash}
        ingresos={ingresos}
        egresos={egresos}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
  highlight?: boolean;
}) {
  return (
    <Card className={cn("rounded-2xl shadow-soft", highlight && "border-primary/40 bg-primary-soft/40")}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1.5 font-display text-xl font-semibold",
            tone === "up" && "text-success",
            tone === "down" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function MovementDialog({
  open,
  onOpenChange,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}) {
  const [type, setType] = useState<"ingreso" | "egreso">("ingreso");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const addMovement = useAddCashMovement(sessionId);

  const reset = () => {
    setType("ingreso");
    setAmount("");
    setConcept("");
  };

  const submit = () => {
    const value = Number(amount.replace(/[^\d]/g, "")) || 0;
    if (value <= 0) {
      toast.error("Ingrese un monto válido");
      return;
    }
    addMovement.mutate(
      { type, amount: value, concept },
      {
        onSuccess: () => {
          toast.success(type === "ingreso" ? "Ingreso registrado" : "Egreso registrado");
          reset();
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo registrar"),
      },
    );
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "ingreso" ? "default" : "outline"}
              className="h-11 rounded-xl"
              onClick={() => setType("ingreso")}
            >
              Ingreso
            </Button>
            <Button
              type="button"
              variant={type === "egreso" ? "default" : "outline"}
              className="h-11 rounded-xl"
              onClick={() => setType("egreso")}
            >
              Egreso
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Monto</Label>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="h-11 rounded-xl text-right"
            />
          </div>

          <div className="space-y-2">
            <Label>Concepto</Label>
            <Input
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              placeholder="Ej. Pago de domicilio"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={addMovement.isPending}
            onClick={submit}
          >
            {addMovement.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseCashDialog({
  open,
  onOpenChange,
  sessionId,
  expected,
  openingAmount,
  openedAt,
  openedByName,
  byMethod,
  abonosCash,
  ingresos,
  egresos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  expected: number;
  openingAmount: number;
  openedAt: string;
  openedByName: string | null;
  byMethod?: PaymentMethodBreakdown;
  abonosCash: number;
  ingresos: number;
  egresos: number;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const closeCash = useCloseCash(sessionId);
  const { data: store } = useStoreInfo();
  const { data: receiptSettings } = useReceiptSettings();

  const countedValue = Number(counted.replace(/[^\d]/g, "")) || 0;
  const difference = countedValue - expected;

  const submit = () => {
    closeCash.mutate(
      { expected, counted: countedValue, notes },
      {
        onSuccess: () => {
          toast.success("Caja cerrada");
          if (byMethod) {
            printCashClose(
              store,
              {
                openedByName,
                openedAt,
                closedAt: new Date().toISOString(),
                openingAmount,
                byMethod,
                abonosCash,
                ingresos,
                egresos,
                expected,
                counted: countedValue,
                difference,
                notes,
              },
              receiptSettings?.widthMm ?? 80,
            );
          }
          setCounted("");
          setNotes("");
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo cerrar la caja"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-surface p-4 text-center">
            <p className="text-xs text-muted-foreground">Esperado en caja (efectivo)</p>
            <p className="font-display text-2xl font-bold text-primary">
              {formatCurrency(expected)}
            </p>
          </div>

          {byMethod && (
            <div className="space-y-1.5 rounded-xl border p-3">
              <p className="text-xs font-medium text-muted-foreground">Arqueo por método de pago</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Efectivo en caja (base inicial)</span>
                <span className="font-medium">{formatCurrency(openingAmount)}</span>
              </div>
              <div className="my-1 border-t" />
              {PAYMENT_METHOD_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{formatCurrency(byMethod[key])}</span>
                </div>
              ))}
              <div className="my-1 border-t" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Abonos de clientes (efectivo)</span>
                <span className="font-medium text-success">+{formatCurrency(abonosCash)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ingresos</span>
                <span className="font-medium text-success">+{formatCurrency(ingresos)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Egresos</span>
                <span className="font-medium text-destructive">-{formatCurrency(egresos)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Efectivo contado</Label>
            <Input
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="h-12 rounded-xl text-right text-lg"
            />
          </div>

          {counted !== "" && (
            <p
              className={cn(
                "text-sm font-medium",
                difference === 0 && "text-muted-foreground",
                difference > 0 && "text-success",
                difference < 0 && "text-destructive",
              )}
            >
              {difference === 0
                ? "Sin diferencia"
                : difference > 0
                  ? `Sobrante: ${formatCurrency(difference)}`
                  : `Faltante: ${formatCurrency(Math.abs(difference))}`}
            </p>
          )}

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={closeCash.isPending}
            onClick={submit}
          >
            {closeCash.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirmar cierre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
