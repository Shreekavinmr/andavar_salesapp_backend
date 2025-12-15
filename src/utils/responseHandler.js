// Utility to standardize API responses
const sendResponse = (res, statusCode, message, data = null, error = null) => {
  const response = {
    success: statusCode < 400,
    message,
    data,
    error
  };
  res.status(statusCode).json(response);
};

module.exports = { sendResponse };