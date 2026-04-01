import { Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import config from "../config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export const verifyStripeSignature = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    return res.status(400).send("Missing Stripe signature");
  }

  let event: Stripe.Event;

  try {
    // req.body must be raw, use express.raw() for this route
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // Attach the verified event to the request object
    (req as any).stripeEvent = event;

    next();
  } catch (err: any) {
    console.error("Stripe signature verification failed:", err.message);
    // return res.status(400).send(`Webhook Error: ${err.message}`);
    next(err);
  }
};
