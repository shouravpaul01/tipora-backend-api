import express from 'express'
import { PostControllers } from './Post.controller'

const router = express.Router()

router.post(
  '/',
  // validateRequest(PostValidation.createPostValidationSchema),
  PostControllers.createPost,
)

router.get(
  '/',
  PostControllers.getAllPost,
)

router.get(
  '/:id',
  PostControllers.getSinglePost,
)

router.put(
  '/:id',
 //  validateRequest(PostValidation.createPostValidationSchema),
  PostControllers.updatePost,
)

router.delete(
  '/:id',
  PostControllers.deletePost,
)

export const PostRoutes = router
