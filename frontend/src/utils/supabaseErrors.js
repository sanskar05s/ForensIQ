const ERROR_MAP = {
  "Invalid login credentials": "Incorrect email or password. Please try again.",

  "Email not confirmed": "Please verify your email before signing in.",

  23505: "This Case ID is already in use.",

  default: "Something went wrong. Please try again.",
};

export function getReadableError(error) {
  if (!error) return ERROR_MAP.default;

  if (ERROR_MAP[error.code]) {
    return ERROR_MAP[error.code];
  }

  if (ERROR_MAP[error.message]) {
    return ERROR_MAP[error.message];
  }

  return ERROR_MAP.default;
}
