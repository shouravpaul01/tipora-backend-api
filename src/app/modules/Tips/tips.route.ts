import express from 'express'
import { TipsControllers } from './tips.controller'

const router = express.Router()

router.post(
  '/',
  // validateRequest(TipsValidation.createTipsValidationSchema),
  TipsControllers.createTips,
)

router.get(
  '/',
  TipsControllers.getAllTips,
)

router.get(
  '/:id',
  TipsControllers.getSingleTips,
)

router.patch(
  '/:id',
 //  validateRequest(TipsValidation.createTipsValidationSchema),
  TipsControllers.updateTips,
)

router.delete(
  '/:id',
  TipsControllers.deleteTips,
)

export const TipsRoutes = router
