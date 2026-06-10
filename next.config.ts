import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: {
    buildActivity: false,
    appIsrStatus: false,
  },
  // Silence the "webpack config with Turbopack" warning in dev; build uses --webpack
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true }

    return config
  },
}

export default nextConfig
