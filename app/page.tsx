'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Copy, Check, AlertCircle, Sparkles, LogOut } from 'lucide-react';
import { QuotationResult, QuotationItem } from '@/lib/types';
import { logout } from '@/app/actions/auth';
import { formatCurrency } from '@/lib/formatCurrency';
import { calculateItemPricing, roundCurrency } from '@/lib/pricing';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

function NumberInput({ value, onChange, className, min, max, step, disabled }: NumberInputProps) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={() => {
        focused.current = true;
        setText('');
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        onChange(Number(next));
      }}
      onBlur={() => {
        focused.current = false;
        if (text === '') {
          setText(String(value));
          onChange(value);
        } else {
          setText(String(Number(text)));
        }
      }}
      className={className}
    />
  );
}

export default function Home() {
  const [customerRequest, setCustomerRequest] = useState('');
  const [supplierRawText, setSupplierRawText] = useState('');
  const [defaultMarkup, setDefaultMarkup] = useState(75);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!customerRequest.trim() || !supplierRawText.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');
    setItems([]);

    try {
      const response = await fetch('/api/generate-quotation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerRequest,
          supplierRawText,
          markupPercentage: defaultMarkup,
          generalDiscountPercentage: generalDiscount,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = 'Failed to generate quotation';

        try {
          const errorData = JSON.parse(errorText) as { error?: string };
          message = errorData.error || message;
        } catch {
          message = errorText || message;
        }

        throw new Error(message);
      }

      const data: QuotationResult = await response.json();
      setItems(data.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(
        message === 'Failed to fetch'
          ? 'Could not reach the quotation API. Check the network connection or server availability, then try again.'
          : message
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkupChange = (index: number, value: number) => {
    setItems((prev) => {
      const updated = prev.map((item, i) => {
        if (i !== index) return item;
        const pricing = calculateItemPricing(
          item.basePrice,
          value,
          item.discountPercentage,
          item.quantity
        );
        return {
          ...item,
          markupPercentage: value,
          ...pricing,
        };
      });
      return updated;
    });
  };

  const handleItemDiscountChange = (index: number, value: number) => {
    setItems((prev) => {
      const updated = prev.map((item, i) => {
        if (i !== index) return item;
        const pricing = calculateItemPricing(
          item.basePrice,
          item.markupPercentage,
          value,
          item.quantity
        );
        return {
          ...item,
          discountPercentage: value,
          ...pricing,
        };
      });
      return updated;
    });
  };

  const handleDiscountedPriceChange = (index: number, value: number) => {
    setItems((prev) => {
      const updated = prev.map((item, i) => {
        if (i !== index) return item;
        const discountedPrice = roundCurrency(
          Math.min(Math.max(0, value), item.markedUpPrice)
        );
        const discountPercentage =
          item.markedUpPrice > 0
            ? roundCurrency((1 - discountedPrice / item.markedUpPrice) * 100)
            : 0;

        return {
          ...item,
          discountPercentage,
          discountedPrice,
          subtotal: roundCurrency(discountedPrice * item.quantity),
        };
      });
      return updated;
    });
  };

  const handleQuantityChange = (index: number, value: number) => {
    setItems((prev) => {
      const updated = prev.map((item, i) => {
        if (i !== index) return item;
        const qty = Math.max(0, value);
        return {
          ...item,
          quantity: qty,
          subtotal: roundCurrency(item.discountedPrice * qty),
        };
      });
      return updated;
    });
  };

  const grandTotal =
    items.length > 0
      ? roundCurrency(items.reduce((sum, item) => sum + item.subtotal, 0))
      : 0;

  const generalDiscountAmount = roundCurrency(
    (grandTotal * generalDiscount) / 100
  );
  const finalTotal = roundCurrency(grandTotal - generalDiscountAmount);

  const formattedOutput = `Quotation

${items
  .map(
    (item) =>
      `${item.size} ${item.quantity}pcs --- ${item.description} @ ${
        item.discountPercentage > 0
          ? `${formatCurrency(item.discountedPrice)}/pc (${item.discountPercentage}% off ${formatCurrency(item.markedUpPrice)})`
          : `${formatCurrency(item.discountedPrice)}/pc`
      } = ${formatCurrency(item.subtotal)}`
  )
  .join('\n')}

TOTAL: ${formatCurrency(grandTotal)}${
    generalDiscount > 0
      ? `\nDiscount (${generalDiscount}%): -${formatCurrency(generalDiscountAmount)}\nFINAL TOTAL: ${formatCurrency(finalTotal)}`
      : ''
  }`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="mb-10 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <Sparkles className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">
                  Quotation Generator
                </h1>
              </div>
              <p className="text-sm text-gray-500">
                AI-powered hardware quotation tool for Philippine suppliers
              </p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="space-y-6">
          <div className="border border-gray-200 rounded-lg p-5 sm:p-8">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-6">
              Input
            </h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Request
                </label>
                <textarea
                  value={customerRequest}
                  onChange={(e) => setCustomerRequest(e.target.value)}
                  placeholder="e.g., Good day, kindly quote: 14mm 2pcs, 18mm 2pcs, 22mm 2pcs"
                  className="w-full h-32 px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none resize-none transition-colors"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Supplier Raw Text
                </label>
                <textarea
                  value={supplierRawText}
                  onChange={(e) => setSupplierRawText(e.target.value)}
                  placeholder="Paste supplier's messy pricing text here..."
                  className="w-full h-32 px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none resize-none transition-colors"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-end sm:gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Markup (%)
                    </label>
                    <NumberInput
                      value={defaultMarkup}
                      onChange={setDefaultMarkup}
                      min={0}
                      max={1000}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                      disabled={isLoading}
                    />
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full sm:w-auto mt-4 sm:mt-0 px-6 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating
                      </>
                    ) : (
                      'Generate Quote'
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  Selling Price = Base Price ÷ Markup%. Applied to every item initially. You can adjust each item&apos;s markup after generating.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-5 flex items-start gap-2.5 p-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-5 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Output
                </h2>
              </div>

              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Breakdown — set markup per item
              </h3>

              <div className="sm:hidden space-y-3">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {item.size}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">Qty</span>
                          <NumberInput
                            value={item.quantity}
                            onChange={(n) => handleQuantityChange(index, n)}
                            min={0}
                            className="w-14 px-2 py-1 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <NumberInput
                          value={item.markupPercentage}
                          onChange={(n) => handleMarkupChange(index, n)}
                          min={0}
                          step={0.1}
                          className="w-16 px-2 py-1 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                        />
                        <span className="text-gray-400 text-sm">%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">Disc</span>
                        <NumberInput
                          value={item.discountPercentage}
                          onChange={(n) => handleItemDiscountChange(index, n)}
                          min={0}
                          step={0.1}
                          className="w-14 px-2 py-1 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                        />
                        <span className="text-gray-400 text-sm">%</span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-500 mb-3">
                      {item.description}
                    </p>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Base</span>
                        <span className="text-gray-900 tabular-nums">
                          {formatCurrency(item.basePrice)}
                        </span>
                      </div>
                      {item.markupPercentage > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Selling</span>
                          <span className="text-gray-500 tabular-nums line-through">
                            {formatCurrency(item.markedUpPrice)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Discounted</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 text-xs">PHP</span>
                          <NumberInput
                            value={item.discountedPrice}
                            onChange={(n) => handleDiscountedPriceChange(index, n)}
                            min={0}
                            max={item.markedUpPrice}
                            step={0.01}
                            className="w-24 px-2 py-1 text-right border border-gray-200 rounded-md text-sm font-medium text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-1.5">
                        <span className="text-gray-500 font-medium">
                          Subtotal
                        </span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">
                      General Discount
                    </span>
                    <div className="flex items-center gap-1">
                      <NumberInput
                        value={generalDiscount}
                        onChange={setGeneralDiscount}
                        min={0}
                        max={100}
                        step={0.1}
                        className="w-16 px-2 py-1 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                      />
                      <span className="text-gray-400 text-sm">%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-sm font-medium text-gray-500">
                      Total
                    </span>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                  {generalDiscount > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-500">
                          Discount ({generalDiscount}%)
                        </span>
                        <span className="text-gray-500 tabular-nums">
                          -{formatCurrency(generalDiscountAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                        <span className="text-sm font-semibold text-gray-900">
                          Final Total
                        </span>
                        <span className="font-bold text-gray-900 tabular-nums">
                          {formatCurrency(finalTotal)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Base
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Markup %
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Disc %
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Discounted
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-t border-gray-100">
                        <td className="py-2.5 px-3 font-medium text-gray-900">
                          {item.size}
                        </td>
                        <td className="py-2.5 px-3">
                          <NumberInput
                            value={item.quantity}
                            onChange={(n) => handleQuantityChange(index, n)}
                            min={0}
                            className="w-14 px-2 py-1.5 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-gray-500">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-500 tabular-nums">
                          {formatCurrency(item.basePrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <NumberInput
                              value={item.markupPercentage}
                              onChange={(n) => handleMarkupChange(index, n)}
                              min={0}
                              step={0.1}
                              className="w-20 px-2 py-1.5 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                            />
                            <span className="text-gray-400">%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <NumberInput
                              value={item.discountPercentage}
                              onChange={(n) => handleItemDiscountChange(index, n)}
                              min={0}
                              step={0.1}
                              className="w-16 px-2 py-1.5 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                            />
                            <span className="text-gray-400">%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-gray-400 text-xs">PHP</span>
                            <NumberInput
                              value={item.discountedPrice}
                              onChange={(n) => handleDiscountedPriceChange(index, n)}
                              min={0}
                              max={item.markedUpPrice}
                              step={0.01}
                              className="w-24 px-2 py-1.5 text-right border border-gray-200 rounded-md text-sm font-medium text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-900 tabular-nums">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td
                        colSpan={7}
                        className="py-3 px-3 text-right text-sm font-medium text-gray-500"
                      >
                        Total
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(grandTotal)}
                      </td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td
                        colSpan={7}
                        className="py-3 px-3 text-right text-sm font-medium text-gray-500"
                      >
                        <div className="flex items-center justify-end gap-2">
                          <span>General Discount</span>
                          <NumberInput
                            value={generalDiscount}
                            onChange={setGeneralDiscount}
                            min={0}
                            max={100}
                            step={0.1}
                            className="w-20 px-2 py-1.5 text-center border border-gray-200 rounded-md text-sm text-gray-900 focus:border-gray-400 focus:outline-none transition-colors"
                          />
                          <span className="text-gray-400">%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900 tabular-nums">
                        {generalDiscount > 0
                          ? `-${formatCurrency(generalDiscountAmount)}`
                          : '—'}
                      </td>
                    </tr>
                    {generalDiscount > 0 && (
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td
                          colSpan={7}
                          className="py-3 px-3 text-right text-sm font-semibold text-gray-900"
                        >
                          Final Total
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums">
                          {formatCurrency(finalTotal)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-between mt-8 mb-3">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Customer Quotation
                </h3>
                <button
                  onClick={handleCopy}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                <pre className="font-mono text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {formattedOutput}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
