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

  if (!options.preserveRefreshToken) {
    localStorage.removeItem("refresh_token");
  }
}
