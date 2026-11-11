import { useMutation } from "@tanstack/react-query";
import { Plus, User, X } from "lucide-react";
import { useState } from "react";
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
import { useCustomers } from "@/features/customers/use-customers";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { getDefaultStoreId } from "@/lib/store";

export type CustomerSelection = { id: string | null; name: string };

/** Search registered customers, or create one on the fly, without leaving the POS. */
export function CustomerPicker({
  value,
  onChange,
}: {
  value: CustomerSelection;
  onChange: (value: CustomerSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickPhone, setQuickPhone] = useState("");

  const { data: matches } = useCustomers(value.name);
  const selected = value.id ? matches?.find((c) => c.id === value.id) : null;

  const createCustomer = useMutation({
    mutationFn: async () => {
      const name = value.name.trim();
      if (!name) throw new Error("Ingrese un nombre");
      const store_id = await getDefaultStoreId();
      const { data, error } = await supabase
        .from("customers")
        .insert({ name, phone: quickPhone.trim() || null, store_id })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (customer) => {
      onChange({ id: customer.id, name: customer.name });
      setQuickOpen(false);
      setQuickPhone("");
      toast.success("Cliente creado");
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo crear el cliente"),
  });

  return (
    <div className="relative">
      <div className="relative">
        <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.name}
          onChange={(event) => {
            onChange({ id: null, name: event.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Cliente (opcional)"
          className="h-9 rounded-lg pl-9 pr-8"
        />
        {value.name && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange({ id: null, name: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {selected && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {selected.credit_limit > 0 ? (
            <>
              Disponible para crédito:{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(Math.max(0, selected.credit_limit - selected.balance))}
              </span>
              {selected.balance > 0 && ` · Debe ${formatCurrency(selected.balance)}`}
            </>
          ) : (
            "Sin cupo de crédito asignado"
          )}
        </p>
      )}

      {open && value.name.trim() && !value.id && (
        <div className="absolute z-20 mt-1 w-full space-y-1 rounded-xl border bg-popover p-1.5 shadow-elevated">
          {matches?.slice(0, 6).map((customer) => (
            <button
              key={customer.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange({ id: customer.id, name: customer.name });
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="truncate">{customer.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {customer.phone || customer.document_number || ""}
              </span>
            </button>
          ))}
          {matches?.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados</p>
          )}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuickOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
          >
            <Plus className="size-3.5" />
            Crear cliente "{value.name.trim()}"
          </button>
        </div>
      )}

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={value.name}
                onChange={(event) => onChange({ id: null, name: event.target.value })}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono (opcional)</Label>
              <Input
                value={quickPhone}
                onChange={(event) => setQuickPhone(event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setQuickOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={createCustomer.isPending}
              onClick={() => createCustomer.mutate()}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
