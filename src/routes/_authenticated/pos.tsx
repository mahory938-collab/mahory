import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bike,
  CheckCircle2,
  ChevronDown,
  Clock,
  Smartphone,
  ImageOff,
  Layers,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveCashSession } from "@/features/cash/use-cash";
import { adjustCustomerBalance } from "@/features/customers/use-customers";
import type { CustomerSelection } from "@/features/pos/customer-picker";
import { CustomerPicker } from "@/features/pos/customer-picker";
import { useCart } from "@/features/pos/use-cart";
import type { PosProduct } from "@/features/pos/use-products";
import {
  findProductByCode,
  findProductById,
  usePosCategories,
  usePosProducts,
} from "@/features/pos/use-products";
import { BarcodeQuickAddDialog } from "@/features/products/barcode-quick-add-dialog";
import { ScannerPairingDialog } from "@/features/scanner/scanner-pairing-dialog";
import { useScannerSession, type ScanEventRow } from "@/features/scanner/use-scanner-session";
import { playBeep } from "@/lib/beep";
import type { Promotion } from "@/features/promotions/use-promotions";
import { findBestPromotion, usePromotions } from "@/features/promotions/use-promotions";
import { printReceipt } from "@/features/sales/print-receipt";
import { useBarcodeWedge } from "@/features/pos/use-barcode-wedge";
import { FEATURES } from "@/lib/plan";
import type { SaleDetail } from "@/features/sales/use-sales";
import { useStoreInfo } from "@/features/sales/use-store-info";
import { usePaymentMethodSettings, useReceiptSettings } from "@/features/settings/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "Punto de venta — Mahory" },
      {
        name: "description",
        content:
          "Pantalla de punto de venta optimizada para pantalla táctil: búsqueda rápida, código de barras y pagos mixtos.",
      },
      { property: "og:title", content: "Punto de venta — Mahory" },
      {
        property: "og:description",
        content: "Cobre en segundos con búsqueda rápida, escáner y múltiples métodos de pago.",
      },
    ],
  }),
  component: PosPage,
});

const ALL_PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "credito", label: "Crédito" },
] as const;

type PaymentMethod = (typeof ALL_PAYMENT_METHODS)[number]["value"];
const CASH_PRESETS = [10000, 20000, 50000, 100000];

type PaymentLine = { key: string; method: PaymentMethod; amount: number };
type DeliveryType = "mostrador" | "domicilio";

let paymentLineSeq = 0;
const newPaymentLine = (patch: Partial<PaymentLine> = {}): PaymentLine => ({
  key: `pl-${(paymentLineSeq += 1)}`,
  method: "efectivo",
  amount: 0,
  ...patch,
});

function PosPage() {
  const { user, profile, role, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const cart = useCart();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerSelection>({ id: null, name: "" });
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("mostrador");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([newPaymentLine()]);
  const [completedSale, setCompletedSale] = useState<SaleDetail | null>(null);
  const [heldListOpen, setHeldListOpen] = useState(false);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);

  const { data: categories } = usePosCategories();
  const { data: products, isLoading } = usePosProducts(search, categoryId);
  const { data: promotions } = usePromotions();

  useEffect(() => {
    if (cart.lines.length === 0) setCartOpen(false);
  }, [cart.lines.length]);

  const addToCart = (product: NonNullable<typeof products>[number]) => {
    const promo = findBestPromotion(promotions ?? [], product);
    cart.addProduct(product, 1, promo ? { percent: promo.percent, label: promo.name } : undefined);
  };

  // Escaneos que llegan del celular: se comportan igual que agregar el producto a mano.
  const handlePhoneScan = async (event: ScanEventRow, deviceName: string) => {
    if (!event.found || !event.product_id) {
      playBeep("error");
      toast.error("Producto no encontrado", {
        description: `Código ${event.barcode} · escaneado con ${deviceName}`,
        duration: 15000,
        action: { label: "Registrar producto", onClick: () => setUnknownBarcode(event.barcode) },
      });
      return;
    }

    try {
      const product = await findProductById(event.product_id);
      if (!product) {
        playBeep("error");
        toast.error("Ese producto ya no está disponible", {
          description: event.product_name ?? event.barcode,
        });
        return;
      }
      if (product.stock <= 0) {
        playBeep("error");
        toast.error(`"${product.name}" no tiene stock disponible`, {
          description: `Escaneado con ${deviceName}`,
        });
        return;
      }
      addToCart(product);
      playBeep("ok");
      toast.success(`${product.name} agregado`, {
        description: `Escaneado con ${deviceName}`,
        duration: 2500,
      });
    } catch {
      playBeep("error");
      toast.error("No se pudo agregar el producto escaneado. Revise la conexión.");
    }
  };

  const scanner = useScannerSession(user?.id ?? null, handlePhoneScan);

  // Same product name, different code (e.g. sizes/colors) — group so the
  // grid shows one card per name instead of one scattered card per variant.
  const productGroups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof products>>();
    for (const product of products ?? []) {
      const key = product.name.trim().toLowerCase();
      const list = map.get(key);
      if (list) list.push(product);
      else map.set(key, [product]);
    }
    return [...map.values()];
  }, [products]);
  const { data: activeCashSession, isLoading: cashLoading } = useActiveCashSession();
  const { data: store } = useStoreInfo();
  const { data: paymentMethodSettings } = usePaymentMethodSettings();
  const { data: receiptSettings } = useReceiptSettings();
  // Sin el módulo de caja no se exige turno abierto para vender.
  const canSell = FEATURES.caja ? !cashLoading && Boolean(activeCashSession) : true;
  const canEditPrice = roleHasPermission(role, "pos.edit_price");
  const canDiscount = roleHasPermission(role, "pos.discount");

  const enabledPaymentMethods = ALL_PAYMENT_METHODS.filter(
    (m) => paymentMethodSettings?.[m.value] ?? true,
  );
  const defaultPaymentMethod: PaymentMethod = enabledPaymentMethods[0]?.value ?? "efectivo";

  const heldSalesQuery = useQuery({
    queryKey: ["pos", "held", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, number, customer_name, total, created_at")
        .eq("is_held", true)
        .eq("cashier_id", user?.id as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((s) => ({ ...s, total: Number(s.total) }));
    },
    enabled: Boolean(user?.id),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (payOpen) {
      setPaymentLines([
        newPaymentLine({ amount: cart.totals.total, method: defaultPaymentMethod }),
      ]);
    }
  }, [payOpen, cart.totals.total, defaultPaymentMethod]);

  const totalPaid = useMemo(
    () => paymentLines.reduce((sum, line) => sum + line.amount, 0),
    [paymentLines],
  );
  const pendingAmount = Math.max(0, cart.totals.total - totalPaid);
  const changeAmount = Math.max(0, totalPaid - cart.totals.total);
  const missingDeliveryAddress = deliveryType === "domicilio" && !deliveryAddress.trim();
  const canConfirmPayment = totalPaid >= cart.totals.total && !missingDeliveryAddress;

  const updatePaymentLine = (key: string, patch: Partial<PaymentLine>) => {
    setPaymentLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addPaymentLine = () => {
    setPaymentLines((current) => [...current, newPaymentLine({ amount: pendingAmount })]);
  };
  const removePaymentLine = (key: string) => {
    setPaymentLines((current) =>
      current.length > 1 ? current.filter((l) => l.key !== key) : current,
    );
  };

  const scan = async (code: string) => {
    try {
      const product = await findProductByCode(code);
      if (!product) {
        playBeep("error");
        toast.error("Producto no encontrado", { description: `Código ${code}` });
        return;
      }
      if (product.stock <= 0) {
        playBeep("error");
        toast.error(`"${product.name}" no tiene stock disponible`);
        return;
      }
      addToCart(product);
      playBeep("ok");
      setSearch("");
    } catch {
      playBeep("error");
      toast.error("No se pudo leer el código. Revise la conexión e intente de nuevo.");
    }
  };

  // Lector de escritorio: funciona aunque el cursor no esté en el campo de búsqueda.
  useBarcodeWedge((code) => void scan(code));

  const checkout = useMutation({
    mutationFn: async () => {
      if (!cart.lines.length) throw new Error("El carrito está vacío");
      if (FEATURES.caja && !activeCashSession) {
        throw new Error("Debe abrir caja antes de registrar una venta");
      }
      if (totalPaid < cart.totals.total) throw new Error("El pago no cubre el total de la venta");
      if (deliveryType === "domicilio" && !deliveryAddress.trim()) {
        throw new Error("Ingrese la dirección de entrega");
      }

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error("Sesión expirada. Inicie sesión nuevamente.");
      }

      const activeLines = paymentLines.filter((l) => l.amount > 0);
      const hasCredito = activeLines.some((l) => l.method === "credito");
      const creditoAmount = activeLines
        .filter((l) => l.method === "credito")
        .reduce((sum, l) => sum + l.amount, 0);

      if (creditoAmount > 0) {
        if (!customer.id) {
          throw new Error("Seleccione un cliente registrado para vender a crédito");
        }
        const { data: customerRow, error: customerError } = await supabase
          .from("customers")
          .select("credit_limit, balance")
          .eq("id", customer.id)
          .single();
        if (customerError) throw customerError;

        const creditLimit = Number(customerRow.credit_limit);
        const currentBalance = Number(customerRow.balance);
        if (creditLimit <= 0) {
          throw new Error("Este cliente no tiene cupo de crédito asignado");
        }
        if (currentBalance + creditoAmount > creditLimit) {
          const available = Math.max(0, creditLimit - currentBalance);
          throw new Error(
            `Supera el cupo de crédito disponible (${formatCurrency(available)} disponibles)`,
          );
        }
      }

      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          cashier_id: authUser.id,
          cash_session_id: activeCashSession?.id ?? null,
          customer_id: customer.id,
          customer_name: customer.name.trim() || null,
          delivery_type: deliveryType,
          delivery_address: deliveryType === "domicilio" ? deliveryAddress.trim() : null,
          delivery_fee: Math.round(cart.deliveryFee),
          subtotal: Math.round(cart.totals.subtotal),
          tax_total: Math.round(cart.totals.taxTotal),
          discount_total: Math.round(cart.totals.discountTotal),
          total: Math.round(cart.totals.total),
          paid_total: Math.round(totalPaid),
          cost_total: Math.round(
            cart.lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0),
          ),
          change_amount: Math.round(changeAmount),
          status: hasCredito ? "credito" : "completada",
        })
        .select("id, number, created_at")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        cart.lines.map((line) => ({
          sale_id: sale.id,
          product_id: line.productId,
          product_name: line.name,
          barcode: line.barcode,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          unit_cost: line.unitCost,
          tax_rate: line.taxRate,
          discount: line.discount,
          total: Math.max(0, line.unitPrice * line.quantity - line.discount),
        })),
      );
      if (itemsError) throw itemsError;

      // Cash tendered can exceed the total (change given back) — don't record the
      // change as if it were kept revenue, or the cash drawer expectation inflates.
      let remainingChange = Math.round(changeAmount);
      const paymentRows = activeLines
        .map((line) => {
          const amount = Math.round(line.amount);
          if (line.method !== "efectivo" || remainingChange <= 0) {
            return { sale_id: sale.id, method: line.method, amount };
          }
          const applied = Math.max(0, amount - remainingChange);
          remainingChange -= amount - applied;
          return { sale_id: sale.id, method: line.method, amount: applied };
        })
        .filter((row) => row.amount > 0);

      const { error: payError } = await supabase.from("sale_payments").insert(paymentRows);
      if (payError) throw payError;

      // Discount stock and leave a kardex trail for each line sold.
      await Promise.all(
        cart.lines.map(async (line) => {
          const stockAfter = Math.max(0, line.stock - line.quantity);
          const { error: stockError } = await supabase
            .from("products")
            .update({ stock: stockAfter })
            .eq("id", line.productId);
          if (stockError) throw stockError;

          const { error: moveError } = await supabase.from("inventory_movements").insert({
            product_id: line.productId,
            type: "venta",
            quantity: line.quantity,
            stock_before: line.stock,
            stock_after: stockAfter,
            unit_cost: line.unitCost,
            reference_type: "sale",
            reference_id: sale.id,
            created_by: authUser.id,
          });
          if (moveError) throw moveError;
        }),
      );

      if (creditoAmount > 0 && customer.id) {
        await adjustCustomerBalance(customer.id, creditoAmount);
      }

      return { sale, paymentRows, hasCredito };
    },
    onSuccess: ({ sale, paymentRows, hasCredito }) => {
      toast.success(`Venta #${sale.number} registrada`);
      setCompletedSale({
        id: sale.id,
        number: sale.number,
        status: hasCredito ? "credito" : "completada",
        customer_name: customer.name.trim() || null,
        cashier_name: profile?.full_name || null,
        delivery_type: deliveryType,
        delivery_address: deliveryType === "domicilio" ? deliveryAddress.trim() : null,
        delivery_fee: cart.deliveryFee,
        subtotal: cart.totals.subtotal,
        tax_total: cart.totals.taxTotal,
        discount_total: cart.totals.discountTotal,
        total: cart.totals.total,
        paid_total: totalPaid,
        change_amount: changeAmount,
        created_at: sale.created_at,
        items: cart.lines.map((line) => ({
          id: line.key,
          product_id: line.productId,
          product_name: line.name,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          discount: line.discount,
          tax_rate: line.taxRate,
          total: Math.max(0, line.unitPrice * line.quantity - line.discount),
        })),
        payments: paymentRows.map((row, index) => ({
          id: `${row.method}-${index}`,
          method: row.method,
          amount: row.amount,
          reference: null,
        })),
      });
      cart.clear();
      setCustomer({ id: null, name: "" });
      setDeliveryType("mostrador");
      setDeliveryAddress("");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => {
      const message = error.message.includes("row-level security policy")
        ? "No tiene permisos para registrar la venta con esta sesión. Cierre sesión e ingrese nuevamente."
        : error.message;
      toast.error(message);
    },
  });

  const parkSale = useMutation({
    mutationFn: async () => {
      if (!cart.lines.length) throw new Error("El carrito está vacío");
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Sesión expirada. Inicie sesión nuevamente.");

      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          cashier_id: authUser.id,
          cash_session_id: activeCashSession?.id ?? null,
          customer_id: customer.id,
          customer_name: customer.name.trim() || null,
          delivery_type: deliveryType,
          delivery_address: deliveryType === "domicilio" ? deliveryAddress.trim() : null,
          delivery_fee: Math.round(cart.deliveryFee),
          subtotal: Math.round(cart.totals.subtotal),
          tax_total: Math.round(cart.totals.taxTotal),
          discount_total: Math.round(cart.totals.discountTotal),
          total: Math.round(cart.totals.total),
          paid_total: 0,
          cost_total: Math.round(
            cart.lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0),
          ),
          status: "pendiente",
          is_held: true,
        })
        .select("id, number")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        cart.lines.map((line) => ({
          sale_id: sale.id,
          product_id: line.productId,
          product_name: line.name,
          barcode: line.barcode,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          unit_cost: line.unitCost,
          tax_rate: line.taxRate,
          discount: line.discount,
          total: Math.max(0, line.unitPrice * line.quantity - line.discount),
        })),
      );
      if (itemsError) throw itemsError;

      return sale;
    },
    onSuccess: (sale) => {
      toast.success(`Venta #${sale.number} guardada en espera`);
      cart.clear();
      setCustomer({ id: null, name: "" });
      setDeliveryType("mostrador");
      setDeliveryAddress("");
      queryClient.invalidateQueries({ queryKey: ["pos", "held"] });
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo guardar la venta"),
  });

  const resumeHeldSale = useMutation({
    mutationFn: async (heldSaleId: string) => {
      const { data: items, error: itemsError } = await supabase
        .from("sale_items")
        .select("product_id, product_name, barcode, quantity, unit_price, discount")
        .eq("sale_id", heldSaleId);
      if (itemsError) throw itemsError;

      const productIds = [
        ...new Set((items ?? []).map((i) => i.product_id).filter(Boolean)),
      ] as string[];
      const { data: freshProducts, error: productsError } = productIds.length
        ? await supabase
            .from("products")
            .select("id, price, cost, tax_rate, stock")
            .in("id", productIds)
        : { data: [], error: null };
      if (productsError) throw productsError;
      const productMap = new Map((freshProducts ?? []).map((p) => [p.id, p]));

      const { data: heldSale } = await supabase
        .from("sales")
        .select("customer_id, customer_name, delivery_type, delivery_address, delivery_fee")
        .eq("id", heldSaleId)
        .single();

      const { error: deleteError } = await supabase.from("sales").delete().eq("id", heldSaleId);
      if (deleteError) throw deleteError;

      return { items: items ?? [], productMap, heldSale };
    },
    onSuccess: ({ items, productMap, heldSale }) => {
      const lines = items.map((item, index) => {
        const product = item.product_id ? productMap.get(item.product_id) : undefined;
        return {
          key: `${item.product_id ?? item.product_name}-${index}-${Date.now()}`,
          productId: item.product_id ?? item.product_name,
          name: item.product_name,
          barcode: item.barcode,
          unitPrice: Number(item.unit_price),
          catalogPrice: product ? Number(product.price) : Number(item.unit_price),
          unitCost: product ? Number(product.cost) : 0,
          taxRate: product ? Number(product.tax_rate) : 0,
          quantity: Number(item.quantity),
          discount: Number(item.discount),
          stock: product ? Number(product.stock) : 0,
          promoPercent: 0,
          promoLabel: null,
        };
      });
      cart.restore(lines, Number(heldSale?.delivery_fee ?? 0));
      setCustomer({ id: heldSale?.customer_id ?? null, name: heldSale?.customer_name ?? "" });
      setDeliveryType((heldSale?.delivery_type as DeliveryType) ?? "mostrador");
      setDeliveryAddress(heldSale?.delivery_address ?? "");
      setHeldListOpen(false);
      queryClient.invalidateQueries({ queryKey: ["pos", "held"] });
      toast.success("Venta recuperada al carrito");
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo recuperar la venta"),
  });

  return (
    <AppShell title="Punto de venta" description="Cobre rápido y sin errores" flush>
      <div className="grid h-[calc(100vh-4rem)] grid-cols-1 grid-rows-1 overflow-hidden lg:grid-cols-[1fr_400px]">
        {/* Products */}
        <div className="flex min-h-0 min-w-0 flex-col border-r">
          <div className="flex gap-2 border-b p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && search.trim()) void scan(search.trim());
                }}
                placeholder="Buscar por nombre, código o SKU · escanee el código de barras"
                className="h-12 rounded-xl pl-9 text-base"
              />
            </div>
            {search && (
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => setSearch("")}>
                <X className="size-4" />
              </Button>
            )}
            <Button
              variant={scanner.activeCount > 0 ? "secondary" : "outline"}
              className="h-12 shrink-0 gap-2 rounded-xl"
              onClick={() => setScannerOpen(true)}
              title="Usar el celular como lector de códigos"
            >
              <Smartphone className="size-4" />
              <span className="hidden sm:inline">Conectar celular</span>
              {scanner.activeCount > 0 && (
                <Badge className="rounded-full bg-success px-1.5 text-success-foreground">
                  {scanner.activeCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-12 shrink-0 gap-2 rounded-xl"
              onClick={() => setHeldListOpen(true)}
            >
              <Clock className="size-4" />
              <span className="hidden sm:inline">En espera</span>
              {(heldSalesQuery.data?.length ?? 0) > 0 && (
                <Badge className="rounded-full px-1.5">{heldSalesQuery.data?.length}</Badge>
              )}
            </Button>
          </div>

          <div className="border-b p-3">
            <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 w-full justify-between rounded-xl sm:w-72"
                >
                  <span className="truncate">
                    {categoryId
                      ? categories?.find((c) => c.id === categoryId)?.name
                      : "Todas las categorías"}
                  </span>
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar categoría..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Todas las categorías"
                        onSelect={() => {
                          setCategoryId(null);
                          setCategoryPickerOpen(false);
                        }}
                      >
                        Todas las categorías
                      </CommandItem>
                      {categories?.map((category) => (
                        <CommandItem
                          key={category.id}
                          value={category.name}
                          onSelect={() => {
                            setCategoryId(category.id);
                            setCategoryPickerOpen(false);
                          }}
                        >
                          {category.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {FEATURES.caja && !cashLoading && !activeCashSession && (
            <div
              role="alert"
              className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <Wallet className="size-4 shrink-0 text-warning" />
                Abra la caja para poder registrar ventas.
              </span>
              <Button asChild size="sm" className="h-8 shrink-0 rounded-lg">
                <Link to="/caja">Abrir caja</Link>
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="stagger grid grid-cols-2 gap-3 p-4 max-lg:pb-28 md:grid-cols-3 xl:grid-cols-4">
              {isLoading &&
                [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}

              {!isLoading && products?.length === 0 && (
                <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
                  No se encontraron productos. Agregue productos en el módulo Productos.
                </p>
              )}

              {productGroups.map((group) => {
                const [only] = group;
                // Una sola presentación: no hay nada que elegir, se agrega al carrito de una vez.
                if (group.length === 1 && only) {
                  return (
                    <ProductCard
                      key={only.id}
                      product={only}
                      promo={findBestPromotion(promotions ?? [], only)}
                      onClick={() => addToCart(only)}
                    />
                  );
                }
                const key = group[0].name.trim().toLowerCase();
                const expanded = expandedGroupKey === key;
                return (
                  <Fragment key={key}>
                    <FolderCard
                      group={group}
                      expanded={expanded}
                      onToggle={() => setExpandedGroupKey(expanded ? null : key)}
                    />
                    {expanded && (
                      <div className="col-span-2 grid grid-cols-2 gap-3 rounded-2xl border border-dashed border-primary/30 bg-surface/60 p-3 md:col-span-3 md:grid-cols-3 xl:col-span-4 xl:grid-cols-4">
                        {group.map((product) => {
                          const promo = findBestPromotion(promotions ?? [], product);
                          return (
                            <ProductCard
                              key={product.id}
                              product={product}
                              promo={promo}
                              onClick={() => {
                                addToCart(product);
                                setExpandedGroupKey(null);
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Cart: columna fija en pantallas grandes, hoja deslizable en el celular */}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col bg-surface",
            "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[88vh] max-lg:rounded-t-3xl max-lg:border-t max-lg:shadow-elevated",
            !cartOpen && "max-lg:hidden",
          )}
        >
          <div className="flex items-center justify-between border-b bg-card px-4 py-3 max-lg:rounded-t-3xl">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              <span className="font-display font-semibold">Venta actual</span>
              <Badge variant="secondary" className="rounded-full">
                {cart.totals.itemCount}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg text-primary lg:hidden"
                onClick={() => setCartOpen(false)}
              >
                Seguir agregando
              </Button>
            </div>
            {cart.lines.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg"
                  disabled={parkSale.isPending}
                  onClick={() => parkSale.mutate()}
                >
                  Guardar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg text-destructive"
                  onClick={cart.clear}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-b bg-card px-4 py-2.5">
            <div className="flex items-start gap-1.5">
              <div className="flex-1">
                <CustomerPicker value={customer} onChange={setCustomer} />
              </div>
              <Button
                type="button"
                variant={deliveryType === "domicilio" ? "default" : "outline"}
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg"
                title="Domicilio"
                onClick={() => {
                  const next = deliveryType === "domicilio" ? "mostrador" : "domicilio";
                  setDeliveryType(next);
                  if (next === "mostrador") cart.setDeliveryFee(0);
                }}
              >
                <Bike className="size-4" />
              </Button>
            </div>

            {deliveryType === "domicilio" && (
              <div className="flex items-center gap-1.5">
                <Input
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="Dirección de entrega"
                  className="h-8 flex-1 rounded-lg text-sm"
                />
                <Input
                  value={String(cart.deliveryFee)}
                  onChange={(event) =>
                    cart.setDeliveryFee(Number(event.target.value.replace(/[^\d]/g, "")) || 0)
                  }
                  inputMode="numeric"
                  placeholder="Envío"
                  className="h-8 w-24 shrink-0 rounded-lg text-right text-sm"
                />
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-3">
              {cart.lines.length === 0 && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Agregue productos para iniciar la venta.
                </p>
              )}
              {cart.lines.map((line) => (
                <Card key={line.key} className="animate-pop-bubble rounded-2xl shadow-none">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium">{line.name}</p>
                        {line.promoLabel && (
                          <Badge
                            variant="secondary"
                            className="mt-1 rounded-full bg-success/15 text-success"
                          >
                            Promo: {line.promoLabel} (-{line.promoPercent}%)
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 rounded-lg text-destructive"
                        onClick={() => cart.removeLine(line.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 rounded-lg"
                          onClick={() => cart.setQuantity(line.key, line.quantity - 1)}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-9 text-center text-sm font-semibold">
                          {line.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 rounded-lg"
                          onClick={() => cart.setQuantity(line.key, line.quantity + 1)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      {canEditPrice || line.catalogPrice <= 0 ? (
                        <Input
                          value={String(line.unitPrice)}
                          onChange={(event) =>
                            cart.updateLine(line.key, {
                              unitPrice: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                            })
                          }
                          className="h-9 w-28 rounded-lg text-right text-sm"
                        />
                      ) : (
                        <span className="text-sm font-semibold">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </span>
                      )}
                    </div>
                    {canDiscount && (
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Descuento</Label>
                        <Input
                          value={String(line.discount)}
                          onChange={(event) =>
                            cart.updateLine(line.key, {
                              discount: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                              promoPercent: 0,
                              promoLabel: null,
                            })
                          }
                          className="h-8 flex-1 rounded-lg text-right text-sm"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <div className="space-y-2 border-t bg-card p-4">
            <Row label="Subtotal" value={formatCurrency(cart.totals.subtotal)} />
            <Row label="IVA" value={formatCurrency(cart.totals.taxTotal)} />
            {cart.totals.discountTotal > 0 && (
              <Row label="Descuentos" value={`- ${formatCurrency(cart.totals.discountTotal)}`} />
            )}
            {cart.deliveryFee > 0 && (
              <Row label="Domicilio" value={formatCurrency(cart.deliveryFee)} />
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="font-display text-base font-semibold">Total</span>
              <span className="font-display text-2xl font-bold text-primary">
                {formatCurrency(cart.totals.total)}
              </span>
            </div>
            <Button
              className="h-14 w-full rounded-xl text-base font-semibold"
              disabled={
                cart.lines.length === 0 ||
                authLoading ||
                !user ||
                !canSell ||
                missingDeliveryAddress
              }
              onClick={() => setPayOpen(true)}
            >
              Cobrar
            </Button>
          </div>
        </div>

        {/* Celular: fondo oscuro + barra con el total para abrir el carrito */}
        {cartOpen && (
          <button
            type="button"
            aria-label="Cerrar carrito"
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setCartOpen(false)}
          />
        )}
        {!cartOpen && cart.lines.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 backdrop-blur lg:hidden">
            <Button
              className="h-14 w-full justify-between rounded-xl px-5 text-base font-semibold"
              onClick={() => setCartOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="size-5" />
                Ver venta ({cart.totals.itemCount})
              </span>
              <span>{formatCurrency(cart.totals.total)}</span>
            </Button>
          </div>
        )}
      </div>

      <ScannerPairingDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        devices={scanner.devices}
        onChanged={() => {
          void scanner.refreshSession();
          void scanner.refreshDevices();
        }}
      />

      <BarcodeQuickAddDialog
        open={unknownBarcode !== null}
        onOpenChange={(open) => {
          if (!open) setUnknownBarcode(null);
        }}
        initialBarcode={unknownBarcode ?? undefined}
      />

      {/* Payment / confirmation dialog */}
      <Dialog
        open={payOpen}
        onOpenChange={(open) => {
          setPayOpen(open);
          if (!open) setCompletedSale(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {completedSale ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="animate-pop-bubble size-5 text-success" />
                  Venta completada
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl bg-surface p-4 text-center">
                  <p className="text-xs text-muted-foreground">Folio</p>
                  <p className="font-display text-2xl font-bold text-primary">
                    #{completedSale.number}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total {formatCurrency(completedSale.total)}
                    {completedSale.change_amount > 0 &&
                      ` · Cambio ${formatCurrency(completedSale.change_amount)}`}
                  </p>
                </div>

                {FEATURES.impresion && (
                  <Button
                    variant="outline"
                    className="h-12 w-full gap-2 rounded-xl"
                    onClick={() => printReceipt(store, completedSale, receiptSettings?.widthMm)}
                  >
                    <Printer className="size-4" />
                    Imprimir recibo
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button
                  className="w-full rounded-xl"
                  onClick={() => {
                    setCompletedSale(null);
                    setPayOpen(false);
                  }}
                >
                  Nueva venta
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Registrar pago</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl bg-surface p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total a pagar</p>
                  <p className="font-display text-3xl font-bold text-primary">
                    {formatCurrency(cart.totals.total)}
                  </p>
                </div>

                <div className="space-y-3">
                  {paymentLines.map((line) => (
                    <div key={line.key} className="space-y-2 rounded-xl border p-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={line.method}
                          onValueChange={(value) =>
                            updatePaymentLine(line.key, { method: value as PaymentMethod })
                          }
                        >
                          <SelectTrigger className="h-10 flex-1 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {enabledPaymentMethods.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={String(line.amount)}
                          onChange={(event) =>
                            updatePaymentLine(line.key, {
                              amount: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                            })
                          }
                          inputMode="numeric"
                          className="h-10 w-32 rounded-lg text-right"
                        />
                        {paymentLines.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0 rounded-lg text-destructive"
                            onClick={() => removePaymentLine(line.key)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>

                      {line.method === "efectivo" && (
                        <div className="flex flex-wrap gap-1.5">
                          {CASH_PRESETS.map((preset) => (
                            <Button
                              key={preset}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full text-xs"
                              onClick={() => updatePaymentLine(line.key, { amount: preset })}
                            >
                              {formatCurrency(preset)}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full text-xs"
                            onClick={() =>
                              updatePaymentLine(line.key, { amount: line.amount + pendingAmount })
                            }
                          >
                            Monto exacto
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-lg"
                    onClick={addPaymentLine}
                  >
                    <Plus className="size-3.5" />
                    Agregar otro método (pago mixto)
                  </Button>
                </div>

                <div className="space-y-1 rounded-xl bg-surface p-3 text-sm">
                  <Row label="Pagado" value={formatCurrency(totalPaid)} />
                  {pendingAmount > 0 && (
                    <Row label="Saldo pendiente" value={formatCurrency(pendingAmount)} />
                  )}
                  {changeAmount > 0 && <Row label="Cambio" value={formatCurrency(changeAmount)} />}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setPayOpen(false)}>
                  Volver
                </Button>
                <Button
                  className="rounded-xl"
                  disabled={
                    checkout.isPending || authLoading || !user || !canSell || !canConfirmPayment
                  }
                  onClick={() => setConfirmPaymentOpen(true)}
                >
                  {checkout.isPending ? "Procesando…" : "Confirmar venta"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmPaymentOpen} onOpenChange={setConfirmPaymentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirma el medio de pago?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 pt-1 text-sm">
                {paymentLines
                  .filter((line) => line.amount > 0)
                  .map((line) => (
                    <div key={line.key} className="flex items-center justify-between">
                      <span>
                        {ALL_PAYMENT_METHODS.find((m) => m.value === line.method)?.label ??
                          line.method}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(line.amount)}
                      </span>
                    </div>
                  ))}
                {changeAmount > 0 && (
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span>Cambio a entregar</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Revisar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                setConfirmPaymentOpen(false);
                checkout.mutate();
              }}
            >
              Sí, es correcto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Held sales */}
      <Dialog open={heldListOpen} onOpenChange={setHeldListOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ventas en espera</DialogTitle>
          </DialogHeader>

          {(heldSalesQuery.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tiene ventas guardadas en espera.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {heldSalesQuery.data?.map((held) => (
                <button
                  key={held.id}
                  type="button"
                  disabled={resumeHeldSale.isPending}
                  onClick={() => resumeHeldSale.mutate(held.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      #{held.number}
                      {held.customer_name ? ` · ${held.customer_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(held.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatCurrency(held.total)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ProductCard({
  product,
  promo,
  onClick,
}: {
  product: PosProduct;
  promo: Promotion | null;
  onClick: () => void;
}) {
  const code = product.barcode || product.sku;
  const outOfStock = product.stock <= 0;
  const noPrice = product.price <= 0;
  const blocked = outOfStock;
  return (
    <button
      type="button"
      disabled={blocked}
      onClick={blocked ? undefined : onClick}
      className={cn(
        "relative flex h-40 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition-all",
        "duration-300 ease-[var(--ease-smooth)] hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-bubble active:scale-[0.98]",
        blocked &&
          "cursor-not-allowed opacity-60 hover:translate-y-0 hover:border-border hover:shadow-soft active:scale-100",
      )}
    >
      {promo && (
        <Badge className="absolute right-2 top-2 z-10 rounded-full bg-success text-success-foreground">
          -{promo.percent}%
        </Badge>
      )}
      <div className="h-1/2 w-full shrink-0 overflow-hidden bg-surface">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <ImageOff className="size-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between overflow-hidden p-3">
        <span className="min-w-0">
          <span className="line-clamp-1 text-sm font-medium leading-snug">{product.name}</span>
          {code && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{code}</span>
          )}
        </span>
        <span>
          <span
            className={cn(
              "block truncate font-display text-base font-semibold",
              noPrice ? "text-amber-600 dark:text-amber-400" : "text-primary",
            )}
          >
            {noPrice ? "Sin precio" : formatCurrency(product.price)}
          </span>
          {outOfStock ? (
            <span className="text-xs font-medium text-destructive">Sin stock</span>
          ) : (
            <span className="text-xs text-muted-foreground">Stock: {product.stock}</span>
          )}
        </span>
      </div>
    </button>
  );
}

function FolderCard({
  group,
  expanded,
  onToggle,
}: {
  group: PosProduct[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = group[0];
  const totalStock = group.reduce((sum, p) => sum + p.stock, 0);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "relative flex h-40 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition-all",
        "duration-300 ease-[var(--ease-smooth)] hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-bubble active:scale-[0.98]",
        expanded && "border-primary/50 ring-2 ring-primary/30",
        totalStock <= 0 && "opacity-60",
      )}
    >
      <Badge variant="secondary" className="absolute right-2 top-2 z-10 gap-1 rounded-full">
        <Layers className="size-3" />
        {group.length}
      </Badge>
      <div className="h-1/2 w-full shrink-0 overflow-hidden bg-surface">
        {first.image_url ? (
          <img src={first.image_url} alt={first.name} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <ImageOff className="size-5 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center p-3">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{first.name}</span>
        <span className="mt-1 text-xs text-muted-foreground">
          {group.length === 1 ? "1 presentación" : `${group.length} presentaciones`}
          {" — toque para "}
          {expanded ? "cerrar" : "elegir"}
        </span>
      </div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
