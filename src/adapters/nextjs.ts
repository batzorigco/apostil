/** Next.js file storage shared by the app and the Apostil MCP server. */
import { createStorageHandler } from "../server/storage-handler";

export function createNextjsHandler(directory = ".apostil") {
  return createStorageHandler(process.cwd(), directory, process.env.NODE_ENV === "development");
}
const handler = createNextjsHandler();
export const GET = handler.GET;
export const POST = handler.POST;
