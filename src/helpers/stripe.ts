import Stripe from "stripe";
import { env } from "../config/env.config";


const stripe = new Stripe(env.STRIPE_SECRET_KEY as string);

export default stripe;
