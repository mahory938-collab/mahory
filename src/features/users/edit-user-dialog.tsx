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
import { useUpdateUser, type AppUser } from "@/features/users/use-users";

export function EditUserDialog({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Cambie los datos de la cuenta. Si cambia el correo, la persona debe usar el nuevo para
            iniciar sesión.
          </DialogDescription>
        </DialogHeader>
        {/* Se monta de nuevo por cada usuario, así los campos arrancan con sus datos. */}
        {user && <EditUserForm key={user.id} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const update = useUpdateUser();
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");

  const valid = fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (!valid || update.isPending) return;
    try {
      await update.mutateAsync({
        userId: user.id,
        fullName,
        email,
        phone,
      });
      toast.success("Usuario actualizado");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el usuario");
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
        <Label htmlFor="edit-name">Nombre completo</Label>
        <Input
          id="edit-name"
          className="h-10 rounded-xl"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-email">Correo electrónico</Label>
        <Input
          id="edit-email"
          type="email"
          className="h-10 rounded-xl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-phone">Teléfono (opcional)</Label>
        <Input
          id="edit-phone"
          inputMode="tel"
          className="h-10 rounded-xl"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="rounded-xl" disabled={!valid || update.isPending}>
          {update.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Guardar cambios
        </Button>
      </DialogFooter>
    </form>
  );
}
