/** @type {import("next").NextConfig} */
const config = {
  // Database drivers load native/WASM files at runtime; keep them out of the bundle.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};
export default config;
