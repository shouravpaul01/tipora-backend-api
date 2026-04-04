import { z } from 'zod'

const createTipsValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Tips name is required.' }),
  }),
})

export const TipsValidation = {
  createTipsValidationSchema,
}
