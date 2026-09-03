export interface QuotationItem {
  size: string;
  quantity: number;
  description: string;
  basePrice: number;
  markupPercentage: number;
  markedUpPrice: number;
  discountPercentage: number;
  discountedPrice: number;
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
  discountAmount: number;
  finalTotal: number;
  formattedOutput: string;
}

export interface GenerateQuotationRequest {
  customerRequest: string;
  supplierRawText: string;
  markupPercentage: number;
  generalDiscountPercentage: number;
}
