import { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "../config/env.config";
import prisma from "../shared/prisma";
import { PaymentMethodServices } from "../app/modules/PaymentMethod/paymentMethod.service";
import { UserServices } from "../app/modules/User/user.service";
import { WithdrawServices } from "../app/modules/Withdraw/withdraw.service";

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
    // Connect events (like payout.paid/payout.failed on a connected account)
    // are often routed through a separate endpoint with its own signing
    // secret — try that before giving up.
    // if (env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    //   try {
    //     event = stripe.webhooks.constructEvent(
    //       req.body,
    //       sig,
    //       env.STRIPE_CONNECT_WEBHOOK_SECRET,
    //     );
    //   } catch (connectErr: any) {
    //     return res.status(400).send(`Webhook Error: ${connectErr.message}`);
    //   }
    // } else {
    //   return res.status(400).send(`Webhook Error: ${err.message}`);
    // }
     return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "setup_intent.succeeded": {
        const setupIntent = event.data.object as Stripe.SetupIntent;

        const stripePaymentMethodId = setupIntent.payment_method as string;
        const stripeCustomerId = setupIntent.customer as string;
        console.log("payment", stripePaymentMethodId, stripeCustomerId);

        // Find user by stripeCustomerId
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId },
        });
        if (!user) return res.status(404).send("User not found");

        await PaymentMethodServices.addCard(user.id, stripePaymentMethodId);

        console.log("Card added for user:", user.id);
        break;
      }

      case "account.updated":
        await UserServices.updateOnboardingStatus(
          null,
          event.data.object as Stripe.Account,
        );
        break;

      // ── Instant withdrawal outcome ──────────────────────────────
      // payouts.create() only means Stripe ACCEPTED the request — the real
      // outcome (money actually landing, or bouncing) is only known once
      // one of these events comes back. `event.account` is the connected
      // account the payout happened on (present because this is a Connect
      // event forwarded to the platform endpoint).
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        const connectedAccountId = event.account as string;
        await WithdrawServices.confirmInstantWithdraw(payout, connectedAccountId);
        break;
      }

      case "payout.failed":
      case "payout.canceled": {
        const payout = event.data.object as Stripe.Payout;
        await WithdrawServices.failInstantWithdraw(
          payout,
          payout.failure_message ?? undefined,
        );
        break;
      }

      // A Transfer we already treated as COMPLETED (STANDARD withdrawals
      // finalize right after the transfer) can still bounce back later —
      // this is the only way we'd find out, so availableBalance needs
      // to be restored here.
      case "transfer.reversed": {
        const transfer = event.data.object as Stripe.Transfer;
        await WithdrawServices.handleTransferReversed(transfer);
        break;
      }

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