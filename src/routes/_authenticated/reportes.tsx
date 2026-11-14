import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Banknote,
  Boxes,
  Download,
  PackageX,
  PiggyBank,
  Printer,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { InvestmentBucket, ReportRange } from "@/features/reports/use-reports";
import {
  useCashMovementsReport,
  useCashSessionsReport,
  useInventorySnapshot,
  useInvestmentReport,
  usePurchasesReport,
  useSalesReport,
} from "@/features/reports/use-reports";
import { downloadCsv } from "@/lib/csv";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes — Mahory" },
      { name: "description", content: "Analice el desempeño del negocio." },
      { property: "og:title", content: "Reportes — Mahory" },
      { property: "og:description", content: "Analice el desempeño del negocio." },
    ],
  }),
  component: ReportesPage,
});

const RANGE_LABELS: Record<ReportRange, string> = {
  today: "Hoy",
  week: "Últimos 7 días",
  month: "Este mes",
  all: "Todo",
};

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
  otro: "Otro",
};

function ReportesPage() {
  const [range, setRange] = useState<ReportRange>("month");

  const { data: sales, isLoading: salesLoading } = useSalesReport(range);
  const { data: purchases, isLoading: purchasesLoading } = usePurchasesReport(range);
  const { data: inventory, isLoading: inventoryLoading } = useInventorySnapshot();
  const { data: cashSessions, isLoading: cashLoading } = useCashSessionsReport(range);
  const { data: cashMovements, isLoading: cashMovementsLoading } = useCashMovementsReport(range);
  const { data: investment, isLoading: investmentLoading } = useInvestmentReport();

  const exportTopProducts = () => {
    if (!sales?.topProducts.length) return;
    downloadCsv(
      `productos-mas-vendidos-${range}.csv`,
      ["Producto", "Cantidad", "Total"],
      sales.topProducts.map((p) => [p.name, p.quantity, p.total]),
    );
  };

  const methodTotal = sales?.byMethod.reduce((sum, m) => sum + m.amount, 0) ?? 0;

  return (
    <AppShell
      title="Reportes"
      description="Informes y exportaciones"
      actions={
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as ReportRange)}>
            <SelectTrigger className="h-9 w-40 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RANGE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-9 gap-2 rounded-lg" onClick={exportTopProducts}>
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
          <Button variant="outline" className="h-9 gap-2 rounded-lg" onClick={() => window.print()}>
            <Printer className="size-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            label={`Ventas · ${RANGE_LABELS[range]}`}
            value={formatCurrency(sales?.total)}
            hint={`${formatNumber(sales?.count)} ventas`}
            icon={Receipt}
            loading={salesLoading}
            tone="primary"
          />
          <KpiCard
            label="Ganancia bruta"
            value={formatCurrency(sales?.profit)}
            hint="Ingresos menos costo de mercancía"
            icon={Banknote}
            loading={salesLoading}
          />
          <KpiCard
            label="Ticket promedio"
            value={formatCurrency(sales?.ticketAverage)}
            hint="Promedio por venta"
            icon={TrendingUp}
            loading={salesLoading}
          />
          <KpiCard
            label="Descuentos otorgados"
            value={formatCurrency(sales?.discountTotal)}
            hint={`IVA recaudado: ${formatCurrency(sales?.taxTotal)}`}
            icon={ShoppingBag}
            loading={salesLoading}
          />
          <KpiCard
            label="Compras recibidas"
            value={formatCurrency(purchases?.total)}
            hint={`${formatNumber(purchases?.count)} compras`}
            icon={Boxes}
            loading={purchasesLoading}
          />
          <KpiCard
            label="Valor de inventario"
            value={formatCurrency(inventory?.totalValue)}
            hint={`${formatNumber(inventory?.outOfStock)} agotados · ${formatNumber(inventory?.lowStock)} bajo mínimo`}
            icon={PackageX}
            loading={inventoryLoading}
          />
        </div>

        {/* Investment — what's gone into inventory: purchases + initial stock loaded at creation */}
        <Card className="rounded-2xl shadow-soft">
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <PiggyBank className="size-4 text-primary" />
            <div>
              <CardTitle className="text-base">Inversión en inventario</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compras recibidas + stock inicial cargado al crear productos
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {investmentLoading || inventoryLoading ? (
              <Skeleton className="h-32 rounded-xl" />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-primary/40 bg-primary-soft/40 p-4">
                    <p className="text-xs text-muted-foreground">Total invertido (histórico)</p>
                    <p className="mt-1 font-display text-2xl font-bold text-primary">
                      {formatCurrency(investment?.allTime.total ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Todo lo que ha comprado o cargado alguna vez. Nunca baja, aunque venda.
                    </p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground">Valor actual en inventario</p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {formatCurrency(inventory?.totalValue ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lo que tiene hoy en la tienda. Baja cuando vende, sube cuando compra o crea
                      productos.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Cuánto ha invertido en cada período
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InvestmentBucketCard label="Hoy" bucket={investment?.today} />
                    <InvestmentBucketCard label="Este mes" bucket={investment?.month} />
                    <InvestmentBucketCard label="Este año" bucket={investment?.year} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Chart + payment methods */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-2xl shadow-soft xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ventas por día</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {salesLoading ? (
                <Skeleton className="size-full rounded-xl" />
              ) : (sales?.byDay.length ?? 0) === 0 ? (
                <EmptyState text="No hay ventas en este rango." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sales?.byDay ?? []}>
                    <defs>
                      <linearGradient id="reportSalesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={44}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v))}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-card)",
                        color: "var(--color-card-foreground)",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Ventas"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2.5}
                      fill="url(#reportSalesFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ventas por método de pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {salesLoading ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : (sales?.byMethod.length ?? 0) === 0 ? (
                <EmptyState text="No hay pagos en este rango." />
              ) : (
                sales?.byMethod.map((m) => {
                  const pct = methodTotal ? (m.amount / methodTotal) * 100 : 0;
                  return (
                    <div key={m.method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{METHOD_LABELS[m.method] ?? m.method}</span>
                        <span className="font-medium">{formatCurrency(m.amount)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cash movements — separate from product sales revenue */}
        <Card className="rounded-2xl shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Movimientos de caja · {RANGE_LABELS[range]}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Abonos de clientes, ingresos y egresos manuales — no forman parte del total de
              ventas de arriba.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {cashMovementsLoading ? (
              <Skeleton className="h-16 rounded-xl" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Abonos de clientes</p>
                  <p className="mt-1 font-display text-lg font-semibold text-success">
                    +{formatCurrency(cashMovements?.abonos)}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Ingresos</p>
                  <p className="mt-1 font-display text-lg font-semibold text-success">
                    +{formatCurrency(cashMovements?.ingresos)}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Egresos</p>
                  <p className="mt-1 font-display text-lg font-semibold text-destructive">
                    -{formatCurrency(cashMovements?.egresos)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top products + customers */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="overflow-hidden rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Productos más vendidos</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesLoading &&
                  [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={3}>
                        <Skeleton className="h-8 rounded-lg" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!salesLoading && sales?.topProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Sin datos en este rango.
                    </TableCell>
                  </TableRow>
                )}
                {sales?.topProducts.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="overflow-hidden rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Mejores clientes</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesLoading &&
                  [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={3}>
                        <Skeleton className="h-8 rounded-lg" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!salesLoading && sales?.topCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Sin datos en este rango.
                    </TableCell>
                  </TableRow>
                )}
                {sales?.topCustomers.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{formatNumber(c.count)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Cash sessions */}
        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <Wallet className="size-4 text-primary" />
            <CardTitle className="text-base">Cierres de caja</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cierre</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead>Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashLoading &&
                [0, 1].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}
              {!cashLoading && cashSessions?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No hay cierres de caja en este rango.
                  </TableCell>
                </TableRow>
              )}
              {cashSessions?.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(session.closed_at)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(session.opening_amount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(session.expected_amount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(session.counted_amount)}</TableCell>
                  <TableCell>
                    {session.difference === null ? (
                      "—"
                    ) : (
                      <Badge
                        variant={
                          session.difference === 0
                            ? "secondary"
                            : session.difference > 0
                              ? "outline"
                              : "destructive"
                        }
                        className="rounded-full"
                      >
                        {session.difference === 0
                          ? "Sin diferencia"
                          : session.difference > 0
                            ? `Sobrante ${formatCurrency(session.difference)}`
                            : `Faltante ${formatCurrency(Math.abs(session.difference))}`}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function InvestmentBucketCard({
  label,
  bucket,
  highlight,
}: {
  label: string;
  bucket?: InvestmentBucket;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3",
        highlight ? "border border-primary/40 bg-primary-soft/40" : "bg-surface",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">
        {formatCurrency(bucket?.total ?? 0)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Compras: {formatCurrency(bucket?.purchases ?? 0)} · Stock inicial:{" "}
        {formatCurrency(bucket?.initialStock ?? 0)}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Receipt;
  loading: boolean;
  tone?: "primary";
}) {
  return (
    <Card className="overflow-hidden rounded-2xl shadow-soft">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div
            className={
              tone === "primary"
                ? "grid size-9 place-items-center rounded-xl bg-gradient-brand"
                : "grid size-9 place-items-center rounded-xl bg-primary-soft"
            }
          >
            <Icon
              className={tone === "primary" ? "size-4 text-primary-foreground" : "size-4 text-primary"}
            />
          </div>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-32 rounded-lg" />
        ) : (
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
