/** UPC-A (12 dígitos) y EAN-13 con 0 adelante son el mismo código; se buscan ambos. */
export function barcodeVariants(barcode: string) {
  const variants = new Set([barcode]);
  if (/^\d{12}$/.test(barcode)) variants.add(`0${barcode}`);
  if (/^0\d{12}$/.test(barcode)) variants.add(barcode.slice(1));
  return [...variants];
}
