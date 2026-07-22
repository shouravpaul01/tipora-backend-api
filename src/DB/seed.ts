import bcrypt from "bcrypt";
import prisma from "../shared/prisma";
import { env } from "../config/env.config";

export const initiateSuperAdmin = async () => {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping...");
    return;
  }

  const hashedPassword = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  await prisma.user.create({
    data: {
      firstName: "Super",
      lastName: "Admin",
      fullName: "Super Admin",
      email: env.ADMIN_EMAIL,
      phone: env.ADMIN_PHONENUMBER,
      role: "ADMIN",
      isPhoneVerified:true,
      isEmailVerified:true,
      auth: {
        create: {
          password: hashedPassword,
        },
      },
    },
  });

  console.log("Admin seeded successfully");
};
