class ApiPathError extends Error {
  statusCode: number;
  path:string;
  constructor(statusCode: number,path:string, message: string | undefined, stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.path=path
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default ApiPathError;