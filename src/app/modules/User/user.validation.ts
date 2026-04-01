import { UserRole } from "@prisma/client";
import { z } from "zod";

const userUpdateSchema = z.object({
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
    hospitalId: z.string().optional().optional(),
    clinicId: z.string().optional(),
    role: z.enum(Object.values(UserRole) as [string, ...string[]]).optional(),
  }),
});
const updateMeSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }),
});

export const UserValidation = {
  userUpdateSchema,
  updateMeSchema,
};
