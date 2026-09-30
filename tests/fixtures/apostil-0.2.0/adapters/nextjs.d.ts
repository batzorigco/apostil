/**
 * Next.js API route handler for apostil comment storage.
 * Stores comments as JSON files in the project's .apostil/ directory.
 *
 * Usage:
 *
 * // app/api/apostil/route.ts
 * export { GET, POST } from "apostil/adapters/nextjs";
 *
 * Or with custom directory:
 * import { createNextjsHandler } from "apostil/adapters/nextjs";
 * const { GET, POST } = createNextjsHandler(".my-comments");
 * export { GET, POST };
 */
declare function createNextjsHandler(directory?: string): {
    GET(request: Request): Promise<Response>;
    POST(request: Request): Promise<Response>;
};
declare const GET: (request: Request) => Promise<Response>;
declare const POST: (request: Request) => Promise<Response>;

export { GET, POST, createNextjsHandler };
