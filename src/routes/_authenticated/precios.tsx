import { createFileRoute } from "@tanstack/react-router";
import { ImageOff, ScanBarcode, Search } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { lookupPrice, type PriceResult, type StockStatus } from "@/features/pos/price-lookup";
import { useBarcodeWedge } from "@/features/pos/use-barcode-wedge";
import { playBeep } from "@/lib/beep";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/precios")({
  head: () => ({
    meta: [
      { title: "Consultar precio — Mahory" },
      { name: "description", content: "Pase un producto por el lector para ver su precio." },
    ],
  }),
  component: PreciosPage,
});

const STATUS: Record<StockStatus, { label: string; className: string }> = {
  disponible: { label: "Disponible", className: "bg-success/15 text-success" },
  pocas: { label: "Pocas unidades", className: "bg-warning/20 text-warning-foreground" },
  agotado: { label: "Agotado", className: "bg-destructive/15 text-destructive" },
};

type Shown =
  | { kind: "ok"; code: string; product: PriceResult }
  | { kind: "missing"; code: string }
  | { kind: "error" };

function PreciosPage() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<PriceResult[]>([]);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const product = await lookupPrice(code);
      if (!product) {
        playBeep("error");
        setShown({ kind: "missing", code });
        return;
      }
      playBeep("ok");
      setShown({ kind: "ok", code, product });
      setRecent((list) => [product, ...list.filter((p) => p.id !== product.id)].slice(0, 6));
    } catch {
      playBeep("error");
      setShown({ kind: "error" });
    } finally {
      setLoading(false);
      setTyped("");
    }
  };

  // El lector "escribe" el código: se recibe aunque el cursor no esté en el campo de abajo.
  useBarcodeWedge((code) => void lookup(code));

  return (
    <AppShell
      title="Consultar precio"
      description="Pase el producto por el lector para ver su precio"
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void lookup(typed);
            }}
            placeholder="Escanee el código o escríbalo y pulse Enter"
            className="h-12 rounded-xl pl-9 text-base"
          />
        </div>

        <Card
          className={cn("min-h-72 overflow-hidden rounded-2xl p-6 sm:p-8", loading && "opacity-70")}
        >
          {shown?.kind === "ok" ? (
            <ProductPrice product={shown.product} />
          ) : shown?.kind === "missing" ? (
            <Message
              title="No encontramos este producto"
              hint={`Código ${shown.code}. Puede que no esté registrado en el inventario.`}
              tone="warn"
            />
          ) : shown?.kind === "error" ? (
            <Message
              title="No se pudo consultar"
              hint="Revise la conexión e intente de nuevo."
              tone="warn"
            />
          ) : (
            <Message
              title="Listo para leer"
              hint="Pase el producto por el lector y aquí aparece su precio."
            />
          )}
        </Card>

        {recent.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos consultados
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {recent.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setShown({ kind: "ok", code: "", product })}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card/80 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40"
                >
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="shrink-0 font-display font-semibold text-primary">
                    {product.price > 0 ? formatCurrency(product.price) : "Sin precio"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ProductPrice({ product }: { product: PriceResult }) {
  const status = STATUS[product.status];
  return (
    <div className="animate-fade-up flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
      <div className="grid size-32 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface sm:size-40">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="size-full object-cover" />
        ) : (
          <ImageOff className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xl font-semibold leading-snug sm:text-2xl">{product.name}</p>
        {product.categoryName && (
          <p className="text-sm text-muted-foreground">{product.categoryName}</p>
        )}
        {product.price > 0 ? (
          <p className="font-display text-5xl font-bold tracking-tight text-primary sm:text-6xl">
            {formatCurrency(product.price)}
          </p>
        ) : (
          <p className="font-display text-3xl font-bold text-warning">Sin precio asignado</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 sm:justify-start">
          <Badge className={cn("rounded-full border-transparent px-3 py-1", status.className)}>
            {status.label}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {formatNumber(product.stock)} {product.stock === 1 ? "unidad" : "unidades"}
          </span>
          {product.inactive && (
            <Badge variant="outline" className="rounded-full">
              Inactivo
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ title, hint, tone }: { title: string; hint: string; tone?: "warn" }) {
  return (
    <div className="grid h-full min-h-56 place-items-center text-center">
      <div className="space-y-2">
        <ScanBarcode
          className={cn("mx-auto size-12", tone === "warn" ? "text-warning" : "text-primary/60")}
        />
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
