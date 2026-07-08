import { z } from "zod";

export const TipValidation = {
  sendTip: z.object({
    body: z.object({
      receiverIds: z
        .array(
          z.string().trim().nonempty("Receiver ID is required.")
        )
        .min(1, "At least one receiver is required.")
        .refine(
          (ids) => new Set(ids).size === ids.length,
          {
            message: "Duplicate receivers are not allowed.",
          }
        ),

      totalAmount: z
        .number({
          error: (issue) => {
            if (issue.input === undefined) {
              return "Total amount is required.";
            }

            return "Total amount must be a number.";
          },
        })
        .min(1, "Minimum tip amount is $1."),

      message: z
        .string()
        .trim()
        .max(500, "Message must be at most 500 characters.")
        .optional(),

      // Apple Pay / Google Pay
      walletToken: z.string().trim().optional(),
    }),
  }),
};