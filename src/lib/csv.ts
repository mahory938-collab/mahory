function escapeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Builds a CSV file (Excel-compatible) and triggers a browser download. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  triggerDownload(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" }), filename);
}

/** Downloads any JSON-serializable value as a formatted .json file. */
export function downloadJson(filename: string, data: unknown) {
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" }),
    filename,
  );
}
