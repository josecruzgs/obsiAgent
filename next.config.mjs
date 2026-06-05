/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Salida "standalone": genera un server.js autónomo con sus deps mínimas,
  // ideal para empaquetar en una imagen Docker pequeña.
  output: "standalone",
  // react-force-graph usa APIs de navegador; lo cargamos solo en cliente (dynamic import).
  serverExternalPackages: ["pg"],
  // Fija la raíz del workspace en este proyecto (hay otro lockfile en el HOME).
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
