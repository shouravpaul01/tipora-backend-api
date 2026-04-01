/* eslint-disable no-console */
/* eslint-disable no-undef */
import * as fs from "fs";
import * as path from "path";

// Get folderName and fileName from command line arguments
// const folderName = process.argv[2]
const moduleName = process.argv[2];

if (!moduleName) {
  console.log("Usage: ts-node generate-module.ts <moduleName>");
  process.exit(1);
}

// Define the paths for the new module folder and utils folder
const appPath = path.join(__dirname, "src", "app");
const basePath = path.join(__dirname, "src");
const modulePath = path.join(
  appPath,
  "modules",
  moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
);
const sharedPath = path.join(basePath, "shared");
// Check if the module folder already exists
if (fs.existsSync(modulePath)) {
  console.log(
    `Error: The module folder '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    }' already exists.`
  );
  process.exit(1); // Stop execution if the folder exists
}

// Ensure that the `src/app/modules` and `src/app/utils` directories exist
if (!fs.existsSync(appPath)) {
  fs.mkdirSync(appPath, { recursive: true });
}

if (!fs.existsSync(path.join(__dirname, "src"))) {
  fs.mkdirSync(path.join(__dirname, "src"), { recursive: true });
}

if (!fs.existsSync(path.join(__dirname, "src", "app"))) {
  fs.mkdirSync(path.join(__dirname, "src", "app"), { recursive: true });
}

if (!fs.existsSync(path.join(__dirname, "src", "app", "modules"))) {
  fs.mkdirSync(path.join(__dirname, "src", "app", "modules"), {
    recursive: true,
  });
}

if (!fs.existsSync(sharedPath)) {
  fs.mkdirSync(sharedPath, { recursive: true });
}

// Check and create `catchAsync.ts` if it doesn't exist
const catchAsyncPath = path.join(sharedPath, "catchAsync.ts");
if (!fs.existsSync(catchAsyncPath)) {
  const catchAsyncContent = `import { NextFunction, Request, RequestHandler, Response } from 'express'

const catchAsync = (fn: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err))
  }
}

export default catchAsync
`;

  fs.writeFileSync(catchAsyncPath, catchAsyncContent, "utf8");
  console.log("Created catchAsync.ts in src/app/utils/");
}

// Check and create `catchAsync.ts` if it doesn't exist
const prismaPath = path.join(sharedPath, "prisma.ts");
if (!fs.existsSync(prismaPath)) {
  const prismaContent = `import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export default prisma;
`;

  fs.writeFileSync(prismaPath, prismaContent, "utf8");
  console.log("Created catchAsync.ts in src/app/utils/");
}

// Check and create `sendResponse.ts` if it doesn't exist
const sendResponsePath = path.join(sharedPath, "sendResponse.ts");
if (!fs.existsSync(sendResponsePath)) {
  const sendResponseContent = `import { Response } from 'express'

type TMeta = {
  limit: number
  page: number
  total: number
  totalPage: number
}

type TResponse<T> = {
  statusCode: number
  success: boolean
  message?: string
  meta?: TMeta
  data: T
}

const sendResponse = <T>(res: Response, data: TResponse<T>) => {
  res.status(data?.statusCode).json({
    success: data.success,
    statusCode: data?.statusCode,
    message: data.message,
    meta: data.meta,
    data: data.data,
  })
}

export default sendResponse
`;

  fs.writeFileSync(sendResponsePath, sendResponseContent, "utf8");
  console.log("Created sendResponse.ts in src/app/utils/");
}

// Files to be created
const files = [
  `${moduleName}.route.ts`,
  `${moduleName}.controller.ts`,
  `${moduleName}.service.ts`,
  `${moduleName}.validation.ts`,
];

// Create the module folder if it doesn't exist
if (!fs.existsSync(modulePath)) {
  fs.mkdirSync(modulePath, { recursive: true });
}

// Template content for each file (adjust as necessary)
const generateFileContent = (file: string) => {
  switch (file) {
    case `${moduleName}.route.ts`:
      return `import express from 'express'
import { ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }Controllers } from './${moduleName}.controller'

const router = express.Router()

router.post(
  '/',
  // validateRequest(${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Validation.${
        "create" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }ValidationSchema),
  ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Controllers.create${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      },
)

router.get(
  '/',
  ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Controllers.getAll${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      },
)

router.get(
  '/:id',
  ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Controllers.getSingle${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      },
)

router.patch(
  '/:id',
 //  validateRequest(${
   moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
 }Validation.${
        "create" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }ValidationSchema),
  ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Controllers.update${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      },
)

router.delete(
  '/:id',
  ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Controllers.delete${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      },
)

export const ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }Routes = router
`;

    case `${moduleName}.controller.ts`:
      return `
import { RequestHandler } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../../../shared/catchAsync'
import sendResponse from '../../../shared/sendResponse'
import { ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }Services } from './${moduleName}.service'

const create${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      } = catchAsync(async (req, res) => {
  // const user = req.user
  // req.body.createdBy = user._id
  const result = await ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Services.create${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }IntoDB(req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    } created successfully',
    data: result,
  })
})

const getAll${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }: RequestHandler = catchAsync(async (req, res) => {
  const result = await ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Services.getAll${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }FromDB(req.query)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    }s retrieved successfully',
    // meta: result.meta,
    data: result,
  })
})

const getSingle${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }: RequestHandler = catchAsync(async (req, res) => {
  const result = await ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Services.getSingle${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }FromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    } retrieved successfully',
    data: result,
  })
})

const update${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }: RequestHandler = catchAsync(async (req, res) => {
  const result = await ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Services.update${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }IntoDB(req.params.id, req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    } updated successfully',
    data: result,
  })
})

const delete${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }: RequestHandler = catchAsync(async (req, res) => {
  const result = await ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }Services.delete${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }FromDB(req.params.id)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    } deleted successfully',
    data: result,
  })
})

export const ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }Controllers = {
  create${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)},
  getAll${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)},
  getSingle${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)},
  update${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)},
  delete${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)},
}
`;

    case `${moduleName}.service.ts`:
      return `import prisma from '../../../shared/prisma'
      import QueryBuilder from '../../../helpers/queryBuilder';
      import { ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      } } from "@prisma/client";

const create${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }IntoDB = async (payload: ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }) => {
  const new${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  } = await prisma.${
        moduleName.charAt(0).toLocaleLowerCase() + moduleName.slice(1)
      }.create({data: payload})
  return new${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}
}

const getAll${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }FromDB = async (query: Record<string, unknown>) => {
  
  const all${moduleName}Query = new QueryBuilder(prisma.${
        moduleName.charAt(0).toLocaleLowerCase() + moduleName.slice(1)
      }, query);
  const result = await all${moduleName}Query
    .search(['${moduleName}'])
    .filter()
    .sort()
    .paginate()
    .execute();
  const pagination = await all${moduleName}Query.countTotal();

  return {
    meta: pagination,
    data: result,
  };
}

const getSingle${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }FromDB = async (id: string) => {
  return await prisma.${
    moduleName.charAt(0).toLocaleLowerCase() + moduleName.slice(1)
  }.findUniqueOrThrow({
    where: {
      id: id
    }
  })
}

const update${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }IntoDB = async (id: string, payload: Partial<${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }>) => {
  const updated${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  } = await prisma.${
        moduleName.charAt(0).toLocaleLowerCase() + moduleName.slice(1)
      }.update({
      where: { id },
      data: payload,
    })
  return updated${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}
}

const delete${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }FromDB = async (id: string) => {
  return await prisma.${
    moduleName.charAt(0).toLocaleLowerCase() + moduleName.slice(1)
  }.delete({
    where: { id }
  })
}

export const ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }Services = {
  create${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}IntoDB,
  getAll${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}FromDB,
  getSingle${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}FromDB,
  update${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}IntoDB,
  delete${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}FromDB,
}
`;

    case `${moduleName}.validation.ts`:
      return `import { z } from 'zod'

const ${
        "create" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }ValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: '${
      moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
    } name is required.' }),
  }),
})

export const ${
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
      }Validation = {
  ${
    "create" + moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  }ValidationSchema,
}
`;

    default:
      return "";
  }
};

// Create the files
files.forEach((file) => {
  const filePath = path.join(modulePath, file);
  const content = generateFileContent(file);

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Created ${filePath}`);
});

console.log(
  `Module ${
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1)
  } with files created successfully!`
);
