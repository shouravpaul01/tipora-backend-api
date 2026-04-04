import { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "./config/env.config";
import { UserServices } from "./app/modules/User/user.service";

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