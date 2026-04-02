import bcrypt from "bcrypt";
import prisma from "../src/shared/prisma";

export const initiateSuperAdmin = async () => {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping...");
    return;
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.create({
    data: {
      firstName: "Super",
      lastName: "Admin",
      fullName: "Super Admin",
      email: "admin@example.com",

      role: "ADMIN",
      auth: {
        create: {
          password: hashedPassword,
        },
      },
    },
  });

  console.log("Admin seeded successfully");
};
