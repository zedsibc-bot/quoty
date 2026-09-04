export interface CalculatedItemPricing {
  markedUpPrice: number;
  discountedPrice: number;
  subtotal: number;
}

export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateItemPricing(
  basePrice: number,
  markupPercentage: number,
  discountPercentage: number,
  quantity: number
): CalculatedItemPricing {
  const markupDecimal = markupPercentage / 100 || 1;
  const markedUpPrice = basePrice / markupDecimal;
  const discountedPrice = roundCurrency(
    markedUpPrice * (1 - discountPercentage / 100)
  );
  const subtotal = roundCurrency(discountedPrice * quantity);

  return {
    markedUpPrice,
    discountedPrice,
    subtotal,
  };
}
