import { z } from 'zod'

const createOverviewValidationSchema = z.object({
  body: z.object({
    name: z.string({ message: 'Overview name is required.' }),
  }),
})

export const OverviewValidation = {
  createOverviewValidationSchema,
}
