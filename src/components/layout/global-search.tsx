import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FEATURES } from "@/lib/plan";

const DESTINATIONS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Punto de venta", to: "/pos", icon: ShoppingCart },
  { label: "Ventas", to: "/ventas", icon: BarChart3 },
  { label: "Caja", to: "/caja", icon: Wallet },
  { label: "Productos", to: "/productos", icon: Package },
  { label: "Inventario", to: "/inventario", icon: Boxes },
  { label: "Compras", to: "/compras", icon: Truck },
  { label: "Clientes", to: "/clientes", icon: Users },
] as const;

export function GlobalSearch({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar módulo… (Ctrl + K)" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Ir a">
            {DESTINATIONS.filter((d) => FEATURES.caja || d.to !== "/caja").map((d) => (
              <CommandItem
                key={d.to}
                value={d.label}
                onSelect={() => {
                  setOpen(false);
                  navigate({ to: d.to });
                }}
              >
                <d.icon className="mr-2 size-4" />
                {d.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
