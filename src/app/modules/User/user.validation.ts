import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";

const UpdateProfile = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z
      .string()
      .email({
        message: "Valid email is required.",
      })
      .optional(),
    phone: z.string().min(5).optional(),
   
  }),
});
const updateStatus = z.object({
  body: z.object({
    status: z.enum(UserStatus),
  }),
});

export const UserValidation = {
  UpdateProfile,
  updateStatus
};
