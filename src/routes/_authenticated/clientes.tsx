import { createFileRoute } from "@tanstack/react-router";
import { HandCoins, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { CustomerFormDialog } from "@/features/customers/customer-form-dialog";
import { RegisterPaymentDialog } from "@/features/customers/register-payment-dialog";
import type { Customer } from "@/features/customers/use-customers";
import { useCustomers, useDeleteCustomer } from "@/features/customers/use-customers";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Mahory" },
      { name: "description", content: "Administre clientes, créditos y direcciones." },
      { property: "og:title", content: "Clientes — Mahory" },
      { property: "og:description", content: "Administre clientes, créditos y direcciones." },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const { role, isAdmin } = useAuth();
  const canManage = roleHasPermission(role, "customers.manage");

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);

  const { data: customers, isLoading } = useCustomers(search);
  const deleteCustomer = useDeleteCustomer();

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCustomer.mutateAsync(deleting.id);
      toast.success("Cliente eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el cliente");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell
      title="Clientes"
      description="Base de clientes"
      actions={
        canManage && (
          <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nuevo cliente</span>
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, documento o teléfono"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">Cupo disponible</TableHead>
                <TableHead className="text-right">Saldo pendiente</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canManage ? 7 : 6}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && customers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="py-16 text-center text-sm text-muted-foreground">
                    No se encontraron clientes.
                  </TableCell>
                </TableRow>
              )}

              {customers?.map((customer) => (
                <TableRow
                  key={customer.id}
                  className={canManage ? "cursor-pointer" : undefined}
                  onClick={() => canManage && openEdit(customer)}
                >
                  <TableCell>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.document_number
                        ? `${customer.document_type || ""} ${customer.document_number}`.trim()
                        : "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.phone || customer.email || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.city || "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {customer.credit_limit > 0
                      ? formatCurrency(Math.max(0, customer.credit_limit - customer.balance))
                      : "Sin cupo"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      customer.balance > 0 && "text-destructive",
                    )}
                  >
                    {formatCurrency(customer.balance)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={customer.is_active ? "secondary" : "outline"}
                      className="rounded-full"
                    >
                      {customer.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {customer.balance > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-success"
                            title="Registrar abono"
                            onClick={() => setPayingCustomer(customer)}
                          >
                            <HandCoins className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg"
                          onClick={() => openEdit(customer)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-destructive"
                            onClick={() => setDeleting(customer)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {canManage && (
        <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      )}

      {canManage && (
        <RegisterPaymentDialog
          customer={payingCustomer}
          onOpenChange={(open) => !open && setPayingCustomer(null)}
        />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar “{deleting?.name}”? Esta acción no se puede deshacer.
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
