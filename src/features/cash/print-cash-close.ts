import type { PaymentMethodBreakdown } from "@/features/cash/use-cash";
import type { StoreInfo } from "@/features/sales/use-store-info";
import { formatCurrency, formatDateTime } from "@/lib/format";

const METHOD_LABELS: Record<keyof PaymentMethodBreakdown, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
  otro: "Otro",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type CashCloseReceiptInput = {
  openedByName: string | null;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  byMethod: PaymentMethodBreakdown;
  abonosCash: number;
  ingresos: number;
  egresos: number;
  expected: number;
  counted: number;
  difference: number;
  notes: string;
};

/** Opens a print-ready cash-close (arqueo) report in a new window (thermal 58mm/80mm style). */
export function printCashClose(
  store: StoreInfo | null | undefined,
  data: CashCloseReceiptInput,
  widthMm: 58 | 80 = 80,
) {
  const win = window.open("", "_blank", "width=380,height=640");
  if (!win) return;

  const bodyWidthPx = widthMm === 58 ? 220 : 300;
  const fontSizePx = widthMm === 58 ? 11 : 12;

  const methodsHtml = (Object.keys(METHOD_LABELS) as (keyof PaymentMethodBreakdown)[])
    .map(
      (key) => `
        <tr>
          <td>${METHOD_LABELS[key]}</td>
          <td style="text-align:right;">${formatCurrency(data.byMethod[key])}</td>
        </tr>`,
    )
    .join("");

  const differenceLabel =
    data.difference === 0
      ? "Sin diferencia"
      : data.difference > 0
        ? `Sobrante ${formatCurrency(data.difference)}`
        : `Faltante ${formatCurrency(Math.abs(data.difference))}`;

  win.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Cierre de caja</title>
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
        <p class="muted bold">Cierre de caja</p>
        <hr />
        <p>Abierta: ${formatDateTime(data.openedAt)}${data.openedByName ? ` · ${escapeHtml(data.openedByName)}` : ""}<br/>Cerrada: ${formatDateTime(data.closedAt)}</p>
        <hr />
        <table class="totals">
          <tr><td>Base inicial</td><td class="right">${formatCurrency(data.openingAmount)}</td></tr>
        </table>
        <hr />
        <table>${methodsHtml}</table>
        <hr />
        <table class="totals">
          <tr><td>Abonos de clientes (efvo.)</td><td class="right">+${formatCurrency(data.abonosCash)}</td></tr>
          <tr><td>Ingresos</td><td class="right">+${formatCurrency(data.ingresos)}</td></tr>
          <tr><td>Egresos</td><td class="right">-${formatCurrency(data.egresos)}</td></tr>
        </table>
        <hr />
        <table class="totals">
          <tr class="bold"><td>Esperado en caja</td><td class="right">${formatCurrency(data.expected)}</td></tr>
          <tr><td>Efectivo contado</td><td class="right">${formatCurrency(data.counted)}</td></tr>
          <tr class="bold"><td>${differenceLabel}</td><td class="right"></td></tr>
        </table>
        ${data.notes ? `<hr /><p>Notas: ${escapeHtml(data.notes)}</p>` : ""}
        <hr />
        <p class="footer">${escapeHtml(store?.receipt_footer ?? "Gracias.")}</p>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
