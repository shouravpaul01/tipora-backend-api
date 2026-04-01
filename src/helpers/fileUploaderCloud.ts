import multer from 'multer';

const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

const uploadSingleImage = upload.single('image');

export const fileUploaderCloud = {
  uploadSingleImage,
  upload
};

export default fileUploaderCloud;