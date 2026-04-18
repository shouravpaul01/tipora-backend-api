import { STRIPE_ERROR_MESSAGES } from "./tips.constant";

export const getStripeErrorMessage = (error: any): string => {
  if (error?.decline_code && STRIPE_ERROR_MESSAGES[error.decline_code]) {
    return STRIPE_ERROR_MESSAGES[error.decline_code];
  }
  if (error?.code && STRIPE_ERROR_MESSAGES[error.code]) {
    return STRIPE_ERROR_MESSAGES[error.code];
  }
  return error?.message || "Payment failed. Please try again.";
};