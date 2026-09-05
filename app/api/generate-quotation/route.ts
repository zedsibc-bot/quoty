import { NextRequest, NextResponse } from 'next/server';
import { ParsedItem, QuotationItem, QuotationResult } from '@/lib/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { calculateItemPricing, roundCurrency } from '@/lib/pricing';

const AI_TIMEOUT_MS = 8_500;
const MAX_AI_INPUT_CHARS = 12_000;

const SYSTEM_PROMPT = `Extract hardware quotation items from the customer request and supplier raw text.

Return a JSON object with this exact structure:
{
  "items": [
    {
      "size": "string (e.g., '14mm', '#24', or empty if no size)",
      "quantity": number,
      "description": "string (product description from supplier text or constructed)",
      "basePrice": number (price per unit from supplier, no currency symbols)
    }
  ]
}

Parsing rules:
- Extract item names, sizes, and quantities from the customer request.
- Match each requested item to its corresponding supplier item and price.
- Prices may appear as: "2810", "PHP 2,810", "2810.00", "2,810.00", "2810 pesos", "Ph195.00".
- Remove all currency symbols, commas, and text when extracting prices.
- If supplier text includes a discount near a price, apply it before returning basePrice.
- basePrice is the final supplier cost per unit before markup, rounded to 2 decimals.
- If a requested item has no matching supplier price, omit it.

Return ONLY valid JSON. No explanations or extra text.`;

export const maxDuration = 10;

function compactText(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_AI_INPUT_CHARS);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const startedAt = Date.now();
    const body = await request.json();
    const { customerRequest, supplierRawText, markupPercentage, generalDiscountPercentage } = body;

    if (!customerRequest || !supplierRawText || markupPercentage === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'DeepSeek API key not configured' },
        { status: 500 }
      );
    }

    const userMessage = `Customer request:
${compactText(customerRequest)}

Supplier raw text:
${compactText(supplierRawText)}

Extract the items and prices, return JSON only.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let aiResponse: Response;
    try {
      aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          max_tokens: 1500,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const durationSeconds = Math.round((Date.now() - startedAt) / 100) / 10;
      console.error('DeepSeek fetch failed:', error);

      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: `AI service timed out after ${durationSeconds}s. Please shorten the supplier text or try again.` },
          { status: 504 }
        );
      }

      return NextResponse.json(
        { error: 'Could not reach AI service. Please check the server network and try again.' },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!aiResponse.ok) {
      const errorData = await aiResponse.text();
      console.error('DeepSeek API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to parse with AI' },
        { status: 500 }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      );
    }

    let parsedItems: ParsedItem[];
    try {
      const parsed = JSON.parse(content);
      parsedItems = parsed.items || [];
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    const generalDiscountDecimal = (generalDiscountPercentage || 0) / 100;

    const items: QuotationItem[] = parsedItems.map((item) => {
      const pricing = calculateItemPricing(
        item.basePrice,
        markupPercentage,
        0,
        item.quantity
      );
      return {
        ...item,
        markupPercentage,
        ...pricing,
        discountPercentage: 0,
      };
    });

    const grandTotal = roundCurrency(
      items.reduce((sum, item) => sum + item.subtotal, 0)
    );

    const discountAmount = roundCurrency(grandTotal * generalDiscountDecimal);
    const finalTotal = roundCurrency(grandTotal - discountAmount);

    const formattedLines = items.map((item) => {
      const priceLabel =
        item.discountPercentage > 0
          ? `${formatCurrency(item.discountedPrice)}/pc (${item.discountPercentage}% off ${formatCurrency(item.markedUpPrice)})`
          : `${formatCurrency(item.discountedPrice)}/pc`;
      return `${item.size} ${item.quantity}pcs --- ${item.description} @ ${priceLabel} = ${formatCurrency(item.subtotal)}`;
    });

    let formattedOutput = `Quotation

${formattedLines.join('\n')}

TOTAL: ${formatCurrency(grandTotal)}`;

    if (discountAmount > 0) {
      formattedOutput += `\nDiscount (${generalDiscountPercentage}%): -${formatCurrency(discountAmount)}\nFINAL TOTAL: ${formatCurrency(finalTotal)}`;
    }

    const result: QuotationResult = {
      items,
      grandTotal,
      discountAmount,
      finalTotal,
      formattedOutput,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating quotation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
