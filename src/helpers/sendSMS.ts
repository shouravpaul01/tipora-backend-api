import twilio from "twilio";
import { twilioClient } from "../config/twilio.config";
import { env } from "../config/env.config";




type SendSMSPayload = {
  to: string;
  body: string;
};

export const sendSMS = async ({ to, body }: SendSMSPayload) => {
  try {
    const message = await twilioClient.messages.create({
      body,
      from: env.TWILIO_SENDER_PHONE,
      to,
    });

    return message;
  } catch (error: any) {
    console.error("Twilio SMS Error:", error.message);
    throw new Error("Failed to send SMS");
  }
};