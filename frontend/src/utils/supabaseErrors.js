const ERROR_MAP = {
  "Invalid login credentials": "Incorrect email or password. Please try again.",

  "Email not confirmed": "Please verify your email before signing in.",

  "User already registered": "An account with this email already exists.",

  23505: "This record already exists.",

  "JWT expired": "Your session has expired. Please sign in again.",

  default: "Something went wrong. Please try again.",
};

export function parseSupabaseError(error) {
  if (!error) return ERROR_MAP.default;

  if (error.code && ERROR_MAP[String(error.code)]) {
    return ERROR_MAP[String(error.code)];
  }

  if (error.message && ERROR_MAP[error.message]) {
    return ERROR_MAP[error.message];
  }

  return ERROR_MAP.default;
}
