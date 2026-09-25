import type { AuthPrincipal } from '../auth/tokens.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
    }
  }
}

export {};
