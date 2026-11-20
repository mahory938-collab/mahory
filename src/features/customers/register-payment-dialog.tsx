import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useActiveCashSession } from "@/features/cash/use-cash";
import { FEATURES } from "@/lib/plan";
import type { Customer, PaymentMethod } from "@/features/customers/use-customers";
import { useRegisterCustomerPayment } from "@/features/customers/use-customers";
import { formatCurrency } from "@/lib/format";

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

export function RegisterPaymentDialog({
  customer,
  onOpenChange,
}: {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: activeCashSession } = useActiveCashSession();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [note, setNote] = useState("");
  const registerPayment = useRegisterCustomerPayment();

  useEffect(() => {
    if (customer) {
      setAmount("");
      setMethod("efectivo");
      setNote("");
    }
  }, [customer]);

  const amountValue = Number(amount.replace(/[^\d]/g, "")) || 0;
  const exceeds = customer ? amountValue > customer.balance : false;

  const submit = () => {
    if (!customer) return;
    if (amountValue <= 0) {
      toast.error("Ingrese un monto válido");
      return;
    }
    if (exceeds) {
      toast.error("El abono no puede superar la deuda");
      return;
    }
    registerPayment.mutate(
      {
        customerId: customer.id,
        amount: amountValue,
        method,
        note,
        cashSessionId: activeCashSession?.id ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Abono registrado");
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo registrar el abono"),
      },
    );
  };

  return (
    <Dialog open={Boolean(customer)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
        </DialogHeader>

        {customer && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface p-3 text-sm">
              <p className="font-medium">{customer.name}</p>
              <p className="text-muted-foreground">Debe: {formatCurrency(customer.balance)}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Monto del abono</Label>
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                placeholder="0"
                className="h-11 rounded-xl text-right text-lg"
              />
              {exceeds && (
                <p className="text-xs text-destructive">
                  No puede superar {formatCurrency(customer.balance)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {FEATURES.caja && method === "efectivo" && !activeCashSession && (
                <p className="text-xs text-muted-foreground">
                  No tiene caja abierta — este abono no se sumará al efectivo esperado.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ej. Abono parcial"
                className="h-10 rounded-xl"
              />
            </div>
          </div>
        )}

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
            disabled={registerPayment.isPending}
            onClick={submit}
          >
            {registerPayment.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
