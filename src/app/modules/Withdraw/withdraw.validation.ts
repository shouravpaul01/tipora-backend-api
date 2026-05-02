import { z } from "zod";

// ── Request Withdrawal ────────────────────────────────────────────────────────

const requestWithdraw = z.object({
  body: z.object({
    amount: z
      .number({ error:err=>err.input===undefined?"Amount is required.":"Invalid amount" })
      .positive("Amount must be a positive number.")
      .min(1, "Minimum withdrawal amount is $1.")
      .multipleOf(0.01, "Amount must have at most 2 decimal places."),
  }),
});

const WithdrawValidations = {
  requestWithdraw,
};

export default WithdrawValidations;