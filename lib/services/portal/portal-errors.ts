export class InvalidPortalTokenError extends Error {
  constructor() {
    super("Invalid or expired portal link.");
    this.name = "InvalidPortalTokenError";
  }
}
