import twilio from 'twilio';
import { env } from './env.config';


// const accountSid = env.TWILIO_ACCOUNT_SID;
// const authToken = env.TWILIO_AUTH_TOKEN;

export const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);