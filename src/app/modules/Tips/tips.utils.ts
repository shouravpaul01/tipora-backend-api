import { STRIPE_ERROR_MESSAGES } from "./tips.constant";
const PLATFORM_FEE_PERCENT = 3;
 export const getStripeErrorMessage = (error: any): string => {
  if (error?.decline_code && STRIPE_ERROR_MESSAGES[error.decline_code]) {
    return STRIPE_ERROR_MESSAGES[error.decline_code];
  }
  if (error?.code && STRIPE_ERROR_MESSAGES[error.code]) {
    return STRIPE_ERROR_MESSAGES[error.code];
  }
  return error?.message || "Payment failed. Please try again.";
};
// ── Calculate platform fee and net amount ─────────────

export const calculateFees = (amount: number) => {
  const platformFee = parseFloat(
    ((amount * PLATFORM_FEE_PERCENT) / 100).toFixed(2),
  );
  const netAmount = parseFloat((amount - platformFee).toFixed(2));
  return { platformFee, netAmount };
};