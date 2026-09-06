import { formatCurrency } from '@/lib/formatCurrency';
import { QuotationItem } from '@/lib/types';

interface FormatCustomerQuotationParams {
  items: QuotationItem[];
  grandTotal: number;
  generalDiscountPercentage?: number;
  discountAmount?: number;
  finalTotal?: number;
}

function padRight(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

function padLeft(value: string, width: number): string {
  return value.padStart(width, ' ');
}

export function formatCustomerQuotation({
  items,
  grandTotal,
  generalDiscountPercentage = 0,
  discountAmount = 0,
  finalTotal = grandTotal,
}: FormatCustomerQuotationParams): string {
  const rows = items.map((item, index) => ({
    item: item.size.trim() || String(index + 1),
    description: item.description.trim(),
    unit: 'pc',
    qty: String(item.quantity),
    unitPrice: formatCurrency(item.discountedPrice),
    amountTotal: formatCurrency(item.subtotal),
  }));

  const headers = {
    item: 'ITEM',
    description: 'DESCRIPTION',
    unit: 'UNIT',
    qty: 'QTY',
    unitPrice: 'UNIT PRICE',
    amountTotal: 'AMOUNT TOTAL',
  };

  const widths = {
    item: Math.max(headers.item.length, ...rows.map((row) => row.item.length)),
    description: Math.max(
      headers.description.length,
      ...rows.map((row) => row.description.length)
    ),
    unit: Math.max(headers.unit.length, ...rows.map((row) => row.unit.length)),
    qty: Math.max(headers.qty.length, ...rows.map((row) => row.qty.length)),
    unitPrice: Math.max(
      headers.unitPrice.length,
      ...rows.map((row) => row.unitPrice.length)
    ),
    amountTotal: Math.max(
      headers.amountTotal.length,
      ...rows.map((row) => row.amountTotal.length)
    ),
  };

  const headerLine = [
    padRight(headers.item, widths.item),
    padRight(headers.description, widths.description),
    padRight(headers.unit, widths.unit),
    padLeft(headers.qty, widths.qty),
    padLeft(headers.unitPrice, widths.unitPrice),
    padLeft(headers.amountTotal, widths.amountTotal),
  ].join('  ');

  const itemLines = rows.map((row) =>
    [
      padRight(row.item, widths.item),
      padRight(row.description, widths.description),
      padRight(row.unit, widths.unit),
      padLeft(row.qty, widths.qty),
      padLeft(row.unitPrice, widths.unitPrice),
      padLeft(row.amountTotal, widths.amountTotal),
    ].join('  ')
  );

  let output = `Quotation

${headerLine}
${itemLines.join('\n')}

TOTAL: ${formatCurrency(grandTotal)}`;

  if (discountAmount > 0) {
    output += `\nDiscount (${generalDiscountPercentage}%): -${formatCurrency(discountAmount)}\nFINAL TOTAL: ${formatCurrency(finalTotal)}`;
  }

  return output;
}
