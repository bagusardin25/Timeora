type AuthTokens = {
  access_token?: string;
  refresh_token?: string | null;
};

type PersistAuthTokensOptions = {
  preserveRefreshToken?: boolean;
};

export function persistAuthTokens(
  tokens: AuthTokens,
  options: PersistAuthTokensOptions = {},
): void {
  if (tokens.access_token) {
    localStorage.setItem("token", tokens.access_token);
  }

  if (tokens.refresh_token) {
    localStorage.setItem("refresh_token", tokens.refresh_token);
    return;
  }

  // Keep existing refresh token across access-only refreshes when requested.
  if (!options.preserveRefreshToken) {
    localStorage.removeItem("refresh_token");
  }
}

/** True when both access + refresh tokens are present (required for silent renew). */
export function hasAuthSession(): boolean {
  return Boolean(localStorage.getItem("token") && localStorage.getItem("refresh_token"));
}
