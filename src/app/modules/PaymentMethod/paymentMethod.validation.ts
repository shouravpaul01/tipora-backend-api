import { z } from "zod";

const addCard = z.object({
  body: z.object({
    stripePaymentMethodId: z
      .string()
      .nonempty("Stripe payment method ID is required."),
  }),
});
const addWallet = z.object({
  body: z.object({
    type: z.enum(["APPLE_PAY", "GOOGLE_PAY"], {
      error: "Wallet type is required.",
    }),
  }),
});
export const PaymentMethodValidation = {
  addCard,
  addWallet,
};
