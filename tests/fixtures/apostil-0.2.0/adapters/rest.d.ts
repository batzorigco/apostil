import { A as ApostilStorage } from '../types-oQRt3lYH.js';

/**
 * REST API storage adapter.
 * Works with any backend that implements GET/POST for threads.
 */
declare function createRestAdapter(baseUrl: string): ApostilStorage;

export { createRestAdapter };
