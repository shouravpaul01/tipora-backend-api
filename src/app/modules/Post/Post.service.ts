import prisma from '../../../shared/prisma'
      import QueryBuilder from '../../../helpers/queryBuilder';
      import { Post } from "@prisma/client";

const createPostIntoDB = async (payload: Post) => {
  const newPost = await prisma.post.create({data: payload})
  return newPost
}

const getAllPostFromDB = async (query: Record<string, unknown>) => {
  
  const allPostQuery = new QueryBuilder(prisma.post, query);
  const result = await allPostQuery
    .search(['Post'])
    .filter()
    .sort()
    .paginate()
    .execute();
  const pagination = await allPostQuery.countTotal();

  return {
    meta: pagination,
    result,
  };
}

const getSinglePostFromDB = async (id: string) => {
  return await prisma.post.findUniqueOrThrow({
    where: {
      id: id
    }
  })
}

const updatePostIntoDB = async (id: string, payload: Partial<Post>) => {
  const updatedPost = await prisma.post.update({
      where: { id },
      data: payload,
    })
  return updatedPost
}

const deletePostFromDB = async (id: string) => {
  return await prisma.post.delete({
    where: { id }
  })
}

export const PostServices = {
  createPostIntoDB,
  getAllPostFromDB,
  getSinglePostFromDB,
  updatePostIntoDB,
  deletePostFromDB,
}
