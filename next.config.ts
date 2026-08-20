import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Съобщенията за грешки от server actions се четат от родителите, не от разработчик.
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default nextConfig;
