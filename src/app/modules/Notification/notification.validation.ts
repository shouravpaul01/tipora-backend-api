import { z } from 'zod'

const createNotificationValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Notification name is required.' }),
  }),
})

export const NotificationValidation = {
  createNotificationValidationSchema,
}
