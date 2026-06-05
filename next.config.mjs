/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-force-graph usa APIs de navegador; lo cargamos solo en cliente (dynamic import).
  serverExternalPackages: ["pg"],
  // Fija la raíz del workspace en este proyecto (hay otro lockfile en el HOME).
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
