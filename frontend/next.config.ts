import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // runtime: 'nodejs', // Removed as it is not a valid property
  },
  images: {
   
    domains: ['img.clerk.com'], // Allow images from any domain
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'haven-user-data.s3.ap-south-1.amazonaws.com', // Allow images from any hostname
        port: '',
        pathname: '/generated-images/**', // Allow any path
      },
    ],
  },
};

export default nextConfig;
