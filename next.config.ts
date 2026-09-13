import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  webpack(config,{webpack}) {
    if(process.env.NEXA_BUILD_TARGET==='vercel') {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /(?:@\/|[\\/])lib[\\/]runtime-env(?:\.ts)?$/,
        path.resolve(process.cwd(), "lib/runtime-env.vercel.ts")
      ));
    }
    return config;
  },
  async headers() {
    return [{source:"/:path*",headers:[
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
      {key:"X-Frame-Options",value:"DENY"}
    ]}];
  }
};

export default nextConfig;
