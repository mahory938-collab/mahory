import type { SaleDetail } from "@/features/sales/use-sales";
import type { StoreInfo } from "@/features/sales/use-store-info";
import { formatCurrency, formatDateTime } from "@/lib/format";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
  otro: "Otro",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Opens a print-ready receipt in a new window (thermal 58mm/80mm style). */
export function printReceipt(
  store: StoreInfo | null | undefined,
  sale: SaleDetail,
  widthMm: 58 | 80 = 80,
) {
  const win = window.open("", "_blank", "width=380,height=640");
  if (!win) return;

  const bodyWidthPx = widthMm === 58 ? 220 : 300;
  const fontSizePx = widthMm === 58 ? 11 : 12;

  const itemsHtml = sale.items
    .map(
      (item) => `
        <tr>
          <td colspan="2" style="padding-top:6px;font-weight:600;">${escapeHtml(item.product_name)}</td>
        </tr>
        <tr>
          <td>${item.quantity} x ${formatCurrency(item.unit_price)}</td>
          <td style="text-align:right;">${formatCurrency(item.total)}</td>
        </tr>`,
    )
    .join("");

  const paymentsHtml = sale.payments
    .map(
      (p) => `
        <tr>
          <td>${PAYMENT_LABELS[p.method] ?? p.method}</td>
          <td style="text-align:right;">${formatCurrency(p.amount)}</td>
        </tr>`,
    )
    .join("");

  win.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Recibo #${sale.number}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: ${fontSizePx}px;
            color: #2a1b3d;
            padding: 12px;
            width: ${bodyWidthPx}px;
            margin: 0 auto;
          }
          h1 { font-size: 15px; margin: 0 0 2px; text-align: center; color: #2a1b3d; }
          .muted { color: #8157b8; text-align: center; }
          table { width: 100%; border-collapse: collapse; }
          .totals td { padding-top: 3px; }
          hr { border: none; border-top: 1px dashed #d6c0ee; margin: 10px 0; }
          .right { text-align: right; }
          .bold { font-weight: 700; color: #2a1b3d; }
          .footer { text-align: center; margin-top: 12px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(store?.name ?? "Mahory")}</h1>
        ${store?.address ? `<p class="muted">${escapeHtml(store.address)}</p>` : ""}
        ${store?.phone ? `<p class="muted">${escapeHtml(store.phone)}</p>` : ""}
        <hr />
        <p>Venta #${sale.number}<br/>${formatDateTime(sale.created_at)}</p>
        ${sale.customer_name ? `<p>Cliente: ${escapeHtml(sale.customer_name)}</p>` : ""}
        ${sale.cashier_name ? `<p>Vendedor: ${escapeHtml(sale.cashier_name)}</p>` : ""}
        ${
          sale.delivery_type === "domicilio"
            ? `<p class="bold">*** DOMICILIO ***</p><p>Dirección: ${escapeHtml(sale.delivery_address ?? "—")}</p>`
            : ""
        }
        <hr />
        <table>${itemsHtml}</table>
        <hr />
        <table class="totals">
          <tr><td>Subtotal</td><td class="right">${formatCurrency(sale.subtotal)}</td></tr>
          <tr><td>IVA</td><td class="right">${formatCurrency(sale.tax_total)}</td></tr>
          ${sale.discount_total > 0 ? `<tr><td>Descuento</td><td class="right">-${formatCurrency(sale.discount_total)}</td></tr>` : ""}
          ${sale.delivery_fee > 0 ? `<tr><td>Domicilio</td><td class="right">${formatCurrency(sale.delivery_fee)}</td></tr>` : ""}
          <tr class="bold"><td>Total</td><td class="right">${formatCurrency(sale.total)}</td></tr>
        </table>
        <hr />
        <table>${paymentsHtml}</table>
        ${sale.change_amount > 0 ? `<p class="right">Cambio: ${formatCurrency(sale.change_amount)}</p>` : ""}
        <hr />
        ${sale.status === "anulada" ? `<p class="footer bold">*** VENTA ANULADA ***</p>` : ""}
        <p class="footer">${escapeHtml(store?.receipt_footer ?? "¡Gracias por su compra!")}</p>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
