export interface QuotationItem {
  size: string;
  quantity: number;
  description: string;
  basePrice: number;
  markupPercentage: number;
  markedUpPrice: number;
  subtotal: number;
}

export interface ParsedItem {
  size: string;
  quantity: number;
  description: string;
  basePrice: number;
}

export interface QuotationResult {
  items: QuotationItem[];
  grandTotal: number;
  formattedOutput: string;
}

export interface GenerateQuotationRequest {
  customerRequest: string;
  supplierRawText: string;
  markupPercentage: number;
}
