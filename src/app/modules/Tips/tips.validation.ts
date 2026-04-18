// tip.validation.ts

import { z } from "zod";

export const TipValidation = {
  sendTip: z.object({
    body: z.object({
      receiverId: z.string().nonempty("Receiver ID is required." ),
      amount: z
        .number({ error:err=>err.input===undefined?"Amount is required.":"Invalid amount"  })
        .min(1, "Minimum tip amount is $1."),
    
      message: z
        .string()
        .max(1000, "Message must be at most 500 characters.")
        .optional(),
      // For Apple Pay / Google Pay 
      walletToken: z.string().optional(),
    }),
  }),
};