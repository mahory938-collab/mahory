import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  toDateKey,
  useSaveExpense,
  type Expense,
  type PaymentMethod,
} from "@/features/expenses/use-expenses";

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}) {
  // El formulario se monta de nuevo cada vez que se abre (ver `key` abajo), así que
  // los valores iniciales siempre corresponden al gasto elegido o a uno nuevo.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            Si el pago salió de la caja del turno, regístrelo en Caja como egreso para no contarlo
            dos veces.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ExpenseForm
            key={expense?.id ?? "nuevo"}
            expense={expense}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const save = useSaveExpense(expense?.id ?? null);
  const [concept, setConcept] = useState(expense?.concept ?? "");
  const [amount, setAmount] = useState(expense ? String(Math.round(expense.amount)) : "");
  const [category, setCategory] = useState(expense?.category ?? "otros");
  const [date, setDate] = useState(expense?.expense_date ?? toDateKey(new Date()));
  const [method, setMethod] = useState<PaymentMethod>(expense?.payment_method ?? "efectivo");
  const [notes, setNotes] = useState(expense?.notes ?? "");

  const amountNumber = Number(amount);
  const valid = concept.trim().length >= 2 && amountNumber > 0 && date !== "";

  const submit = async () => {
    if (!valid || save.isPending) return;
    try {
      await save.mutateAsync({
        concept,
        amount: amountNumber,
        category,
        expense_date: date,
        payment_method: method,
        notes,
      });
      toast.success(expense ? "Gasto actualizado" : "Gasto registrado");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el gasto");
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="expense-concept">¿En qué se gastó?</Label>
        <Input
          id="expense-concept"
          className="h-11 rounded-xl"
          placeholder="Ej: Arriendo del local"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="expense-amount">Valor</Label>
          <Input
            id="expense-amount"
            className="h-11 rounded-xl"
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-date">Fecha</Label>
          <Input
            id="expense-date"
            type="date"
            className="h-11 rounded-xl"
            value={date}
            max={toDateKey(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Pagado con</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expense-notes">Notas (opcional)</Label>
        <Textarea
          id="expense-notes"
          rows={2}
          className="rounded-xl"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="rounded-xl" disabled={!valid || save.isPending}>
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {expense ? "Guardar cambios" : "Registrar gasto"}
        </Button>
      </DialogFooter>
    </form>
  );
}
