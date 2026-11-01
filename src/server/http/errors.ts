/**
 * Errors a route is allowed to explain to a caller.
 *
 * Anything thrown that is not one of these is logged and answered with a
 * generic server error, so a driver message or an internal path never reaches a
 * browser.
 */
export class ApplicationRejectedError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code = "rejected", status = 422) {
    super(message);
    this.name = "ApplicationRejectedError";
    this.code = code;
    this.status = status;
  }
}
