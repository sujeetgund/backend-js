import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";

export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    // Get access token from request cookies or from Authorization header
    const accessToken =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!accessToken) throw new ApiError(401, "unauthorized request");

    // Get data from access token
    const decodedToken = jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET
    );

    // Get user from data
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );
    // Check if user exists
    if (!user) throw new ApiError(401, "invalid access token");

    // Put user object in request
    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, "invalid access token");
  }
});
