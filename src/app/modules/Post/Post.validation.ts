import { z } from 'zod'

const createPostValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Post name is required.' }),
  }),
})

export const PostValidation = {
  createPostValidationSchema,
}
