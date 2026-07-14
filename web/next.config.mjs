/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server bundle with only the deps it actually uses.
  // Turns a ~600MB node_modules image into a ~150MB one for the droplet.
  output: "standalone",
};
export default nextConfig;
