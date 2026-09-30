"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/adapters/rest.ts
var rest_exports = {};
__export(rest_exports, {
  createRestAdapter: () => createRestAdapter
});
module.exports = __toCommonJS(rest_exports);
function createRestAdapter(baseUrl) {
  return {
    async load(pageId) {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[apostil] load failed: ${res.status} ${res.statusText} \u2014 ${url}`);
          return [];
        }
        const data = await res.json();
        return data;
      } catch (e) {
        console.warn(`[apostil] load error:`, e, `\u2014 ${url}`);
        return [];
      }
    },
    async save(pageId, threads) {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(threads)
        });
        if (!res.ok) {
          console.warn(`[apostil] save failed: ${res.status} ${res.statusText} \u2014 ${url}`);
        }
      } catch (e) {
        console.warn(`[apostil] save error:`, e, `\u2014 ${url}`);
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createRestAdapter
});
//# sourceMappingURL=rest.cjs.map