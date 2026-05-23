export class AdminAuthRequiredError extends Error {
  constructor() {
    super("Admin authentication required.");
    this.name = "AdminAuthRequiredError";
  }
}

export class AdminAccountDisabledError extends Error {
  constructor() {
    super("Admin account is disabled.");
    this.name = "AdminAccountDisabledError";
  }
}

export class AdminAuthConfigurationError extends Error {
  constructor(message = "Admin auth is not configured.") {
    super(message);
    this.name = "AdminAuthConfigurationError";
  }
}
