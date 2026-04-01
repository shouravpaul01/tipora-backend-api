
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
      name: "Super Admin",
      email: "admin@example.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log("Admin seeded successfully");
};