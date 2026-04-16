/** @type {import('next').NextConfig} */
const nextConfig = {
  // zkverifyjs is ESM-only; keep it out of the webpack server bundle
  experimental: {
    serverComponentsExternalPackages: ['zkverifyjs'],
  },
}

module.exports = nextConfig
