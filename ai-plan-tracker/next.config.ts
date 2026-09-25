import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯静态导出：价格数据在构建时写入页面，部署到任意静态托管即可。
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
