const webpack = require("webpack");
module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve.fallback = {
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        assert: require.resolve("assert"),
        buffer: require.resolve("buffer"),
        process: require.resolve("process/browser.js"),
      };
      config.resolve.alias = {
        ...config.resolve.alias,
        "process/browser": require.resolve("process/browser.js"),
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser.js",
        })
      );
      return config;
    },
  },
};
