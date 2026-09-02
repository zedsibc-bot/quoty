import { NextRequest, NextResponse } from 'next/server';
import { ParsedItem, QuotationItem, QuotationResult } from '@/lib/types';
import { formatCurrency } from '@/lib/formatCurrency';

const SYSTEM_PROMPT = `You are a quotation parsing assistant for a hardware supplier in the Philippines.

Your task is to extract structured data from two inputs:
1. Customer's request (items, sizes, quantities)
2. Supplier's raw pricing text (messy, contains prices)

Return a JSON object with this exact structure:
{
  "items": [
    {
      "size": "string (e.g., '14mm')",
      "quantity": number,
      "description": "string (product description from supplier text or constructed)",
      "basePrice": number (price per piece from supplier, no currency symbols)
    }
  ]
}

Parsing rules:
- Extract size and quantity from customer request (e.g., "14mm 2pcs" or "2 pieces of 14mm")
- Match each item to its corresponding price in supplier text
- Prices may appear as: "2810", "₱2,810", "2810.00", "2,810.00", "2810 pesos"
- Remove all currency symbols, commas, and text when extracting prices
- If description is not clear from supplier text, construct it as "UNIKA TCT Hole Cutter [size] x [length]"
- Common lengths: 14mm=35mmL, 18mm=50mm, 22mm=50mm, 25mm=50mm, 32mm=50mm, 35mm=50mm, 42mm=50mm, 50mm=50mm

Example:
Customer: "Need 14mm 2pcs and 18mm 3pcs"
Supplier: "TCT 14mm hole cutter 2810 each, 18mm size is 3690"

Output:
{
  "items": [
    {"size": "14mm", "quantity": 2, "description": "UNIKA TCT Hole Cutter 14mm x 35mmL", "basePrice": 2810},
    {"size": "18mm", "quantity": 3, "description": "UNIKA TCT Hole Cutter 18mm x 50mm", "basePrice": 3690}
  ]
}

Return ONLY valid JSON. No explanations or extra text.`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { customerRequest, supplierRawText, markupPercentage } = body;

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
${customerRequest}

Supplier raw text:
${supplierRawText}

Extract the items and prices, return JSON only.`;

    const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
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
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

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

    const markup = 1 + markupPercentage / 100;

    const items: QuotationItem[] = parsedItems.map((item) => {
      const itemMarkup = markup;
      const markedUpPrice = item.basePrice * itemMarkup;
      const subtotal = markedUpPrice * item.quantity;
      return {
        ...item,
        markupPercentage: (itemMarkup - 1) * 100,
        markedUpPrice,
        subtotal,
      };
    });

    const grandTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

    const formattedLines = items.map((item) => {
      return `${item.size} ${item.quantity}pcs --- ${item.description} @ ${formatCurrency(item.markedUpPrice)}/pc = ${formatCurrency(item.subtotal)}`;
    });

    const formattedOutput = `Quotation

${formattedLines.join('\n')}

GRAND TOTAL: ${formatCurrency(grandTotal)}`;

    const result: QuotationResult = {
      items,
      grandTotal,
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
