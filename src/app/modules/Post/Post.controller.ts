
import { RequestHandler } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../../shared/catchAsync'
import sendResponse from '../../../shared/sendResponse'
import { PostServices } from './Post.service'

const createPost: RequestHandler = catchAsync(async (req, res) => {
  // const user = req.user
  // req.body.createdBy = user._id
  const result = await PostServices.createPostIntoDB(req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Post created successfully',
    data: result,
  })
})

const getAllPost: RequestHandler = catchAsync(async (req, res) => {
  const result = await PostServices.getAllPostFromDB(req.query)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Posts retrieved successfully',
    // meta: result.meta,
    data: result,
  })
})

const getSinglePost: RequestHandler = catchAsync(async (req, res) => {
  const result = await PostServices.getSinglePostFromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post retrieved successfully',
    data: result,
  })
})

const updatePost: RequestHandler = catchAsync(async (req, res) => {
  const result = await PostServices.updatePostIntoDB(req.params.id, req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post updated successfully',
    data: result,
  })
})

const deletePost: RequestHandler = catchAsync(async (req, res) => {
  const result = await PostServices.deletePostFromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post deleted successfully',
    data: result,
  })
})

export const PostControllers = {
  createPost,
  getAllPost,
  getSinglePost,
  updatePost,
  deletePost,
}
