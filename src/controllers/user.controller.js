import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    // Get user from userId
    const user = await User.findById(userId);

    // Generate access and refresh tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Insert refreshToken in user
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating access and refresh tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // Get user details from request
  const { username, email, fullName, password } = req.body;
  console.log(username, email, fullName);

  // Check if all fields are not empty
  if (
    [username, email, fullName, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if user already exists - username and email must be unique for each user
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser)
    throw new ApiError(409, "User with email or username already exists");

  // Get file paths uploaded by multer
  console.log("[req.files object]: ", req.files);
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) throw new ApiError(400, "Avatar is required");

  // Upload files on cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar)
    throw new ApiError(500, "Error while uploading avatar to cloudinary");

  // Create user object
  const user = await User.create({
    username: username.toLowerCase(),
    fullName,
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  // Check if user is created
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser)
    throw new ApiError(500, "Something went wrong while creating new user");

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // Get data
  const { email, username, password } = req.body;
  if (!(username || email))
    throw new ApiError(400, "username or email is required");

  // Find user in database
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  // Check if user exists
  if (!user) throw new ApiError(404, "user does not found");

  // Check if password is valid
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) throw new ApiError(401, "invalid user credentials");

  // Create and get access, refresh tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "user logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: "" },
    },
    {
      new: true,
    }
  );
  console.log(user);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "user logged out successfully"));
});

export { registerUser, loginUser, logoutUser };
