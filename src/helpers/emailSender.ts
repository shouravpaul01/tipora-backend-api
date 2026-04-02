import nodemailer from "nodemailer";
import ApiError from "../errors/ApiErrors";
import { env } from "../config/env.config";

const emailSender = async ({subject, to, html}:{subject: string, to: string, html: string}) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.EMAIL,
      pass: env.APP_PASS,
    },
  });

  const emailTransport = transporter;

  const mailOptions = {
    from: `<${env.EMAIL}>`,
    to,
    subject,
    html,
  };

  // Send the email
  try {
    const info = await emailTransport.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.error("Error sending email:", error);
    throw new ApiError(500, "Error sending email");
  }
};

export default emailSender;


