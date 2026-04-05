import { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "../config/env.config";
import prisma from "../shared/prisma";
import { PaymentMethodServices } from "../app/modules/PaymentMethod/paymentMethod.service";
import { UserServices } from "../app/modules/User/user.service";


const stripe = new Stripe(env.STRIPE_SECRET_KEY!);

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "setup_intent.succeeded":
        const setupIntent = event.data.object as Stripe.SetupIntent;

        const stripePaymentMethodId = setupIntent.payment_method as string;
        const stripeCustomerId = setupIntent.customer as string;

        // Find user by stripeCustomerId
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId },
        });
        if (!user) return res.status(404).send("User not found");

        await PaymentMethodServices.addCard(user.id, stripePaymentMethodId);

        console.log("Card added for user:", user.id);
        break;

      case "account.updated":
        await UserServices.updateOnboardingStatus(
          event.data.object as Stripe.Account,
        );
        break;

      //  future events easily add
      case "payment_intent.succeeded":
        console.log("Payment success:", event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error.message);
    res.status(500).send("Webhook handler failed");
  }
};
