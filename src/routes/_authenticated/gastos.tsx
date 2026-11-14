import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseFormDialog } from "@/features/expenses/expense-form-dialog";
import {
  categoryLabel,
  methodLabel,
  toDateKey,
  useDeleteExpense,
  useExpenses,
  type Expense,
} from "@/features/expenses/use-expenses";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos — Mahory" },
      { name: "description", content: "Registre y revise los gastos de su tienda." },
      { property: "og:title", content: "Gastos — Mahory" },
      { property: "og:description", content: "Registre y revise los gastos de su tienda." },
    ],
  }),
  component: GastosPage,
});

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-11-14" → "14 nov" sin pasar por zonas horarias. */
function shortDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]?.slice(0, 3)}`;
}

function GastosPage() {
  const { role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const allowed = roleHasPermission(role, "expenses.manage");

  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const { data: expenses, isLoading, isError, refetch } = useExpenses(cursor.year, cursor.month);
  const deleteExpense = useDeleteExpense();

  useEffect(() => {
    if (!authLoading && !allowed) navigate({ to: "/pos", replace: true });
  }, [authLoading, allowed, navigate]);

  if (!authLoading && !allowed) return null;

  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const todayKey = toDateKey(today);

  const list = expenses ?? [];
  const total = list.reduce((sum, e) => sum + e.amount, 0);
  const todayTotal = list
    .filter((e) => e.expense_date === todayKey)
    .reduce((s, e) => s + e.amount, 0);

  const byCategory = [
    ...list
      .reduce(
        (map, e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount),
        new Map<string, number>(),
      )
      .entries(),
  ].sort((a, b) => b[1] - a[1]);

  const moveMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteExpense.mutateAsync(deleting.id);
      toast.success("Gasto eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el gasto");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell
      title="Gastos"
      description="Lo que sale del negocio, mes a mes"
      actions={
        <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuevo gasto</span>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-xl"
            onClick={() => moveMonth(-1)}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex h-10 min-w-44 items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium capitalize">
            <CalendarDays className="size-4 text-muted-foreground" />
            {MONTHS[cursor.month]} {cursor.year}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-xl"
            onClick={() => moveMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl p-4 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total del mes
            </p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-40 rounded-lg" />
            ) : (
              <p className="mt-1 font-display text-3xl font-semibold">{formatCurrency(total)}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {list.length} {list.length === 1 ? "gasto" : "gastos"}
            </p>
          </Card>
          <Card className="rounded-2xl p-4 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Gastado hoy
            </p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-40 rounded-lg" />
            ) : (
              <p className="mt-1 font-display text-3xl font-semibold">
                {formatCurrency(todayTotal)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {isCurrentMonth ? "Gastos registrados con fecha de hoy" : "Solo aplica al mes actual"}
            </p>
          </Card>
        </div>

        {byCategory.length > 0 && (
          <Card className="rounded-2xl p-4 shadow-soft">
            <p className="mb-3 text-sm font-medium">En qué se va el dinero</p>
            <div className="space-y-3">
              {byCategory.map(([category, amount]) => (
                <div key={category}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{categoryLabel(category)}</span>
                    <span className="shrink-0 font-medium">{formatCurrency(amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${total > 0 ? Math.max(3, (amount / total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                <TableHead className="hidden md:table-cell">Pagado con</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {isError && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm">
                    <p className="text-muted-foreground">No se pudieron cargar los gastos.</p>
                    <Button
                      variant="outline"
                      className="mt-3 rounded-xl"
                      onClick={() => void refetch()}
                    >
                      Reintentar
                    </Button>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && list.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-16 text-center text-sm text-muted-foreground"
                  >
                    <TrendingDown className="mx-auto mb-2 size-6 opacity-50" />
                    No hay gastos en este mes.
                  </TableCell>
                </TableRow>
              )}

              {list.map((expense) => (
                <TableRow
                  key={expense.id}
                  className="cursor-pointer"
                  onClick={() => openEdit(expense)}
                >
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {shortDate(expense.expense_date)}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{expense.concept}</p>
                    {expense.notes && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">{expense.notes}</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="rounded-full font-normal">
                      {categoryLabel(expense.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {methodLabel(expense.payment_method)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => openEdit(expense)}
                        aria-label="Editar gasto"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg text-destructive"
                        onClick={() => setDeleting(expense)}
                        aria-label="Eliminar gasto"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar “{deleting?.concept}” por {formatCurrency(deleting?.amount)}? Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
