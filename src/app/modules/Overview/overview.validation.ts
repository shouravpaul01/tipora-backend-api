import { z } from 'zod'

const createOverviewValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Overview name is required.' }),
  }),
})

export const OverviewValidation = {
  createOverviewValidationSchema,
}
