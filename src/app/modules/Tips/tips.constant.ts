
export const STRIPE_ERROR_MESSAGES: Record<string, string> = {
  card_declined: "Your card was declined. Please use a different card.",
  insufficient_funds: "Insufficient funds. Please use a different card.",
  expired_card: "Your card has expired. Please update your payment method.",
  incorrect_cvc: "Incorrect CVC. Please check your card details.",
  processing_error: "Card processing error. Please try again.",
  card_velocity_exceeded: "Too many attempts. Please try again later.",
  do_not_honor: "Card declined by bank. Please contact your bank.",
  lost_card: "This card has been reported lost. Please use a different card.",
  stolen_card: "This card has been reported stolen. Please use a different card.",
  fraudulent: "This transaction was flagged. Please contact support.",
};

export const CARD_DISABLE_CODES = new Set([
  "expired_card",
  "card_declined",
  "lost_card",
  "stolen_card",
  "fraudulent",
]);