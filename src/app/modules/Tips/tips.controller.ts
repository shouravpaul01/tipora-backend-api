
import { RequestHandler } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../../shared/catchAsync'
import sendResponse from '../../../shared/sendResponse'
import { TipsServices } from './tips.service'

const createTips = catchAsync(async (req, res) => {
  // const user = req.user
  // req.body.createdBy = user._id
  const result = await TipsServices.createTipsIntoDB(req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Tips created successfully',
    data: result,
  })
})

const getAllTips: RequestHandler = catchAsync(async (req, res) => {
  const result = await TipsServices.getAllTipsFromDB(req.query)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tipss retrieved successfully',
    // meta: result.meta,
    data: result,
  })
})

const getSingleTips: RequestHandler = catchAsync(async (req, res) => {
  const result = await TipsServices.getSingleTipsFromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tips retrieved successfully',
    data: result,
  })
})

const updateTips: RequestHandler = catchAsync(async (req, res) => {
  const result = await TipsServices.updateTipsIntoDB(req.params.id, req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tips updated successfully',
    data: result,
  })
})

const deleteTips: RequestHandler = catchAsync(async (req, res) => {
  const result = await TipsServices.deleteTipsFromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tips deleted successfully',
    data: result,
  })
})

export const TipsControllers = {
  createTips,
  getAllTips,
  getSingleTips,
  updateTips,
  deleteTips,
}
