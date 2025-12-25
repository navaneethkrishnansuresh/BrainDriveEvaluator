const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const deps = require("./package.json").dependencies;

// BrainDrive Evaluator plugin configuration
const PLUGIN_NAME = "BrainDriveEvaluator";
const PLUGIN_PORT = 3009;

module.exports = {
  mode: "development",
  entry: "./src/index",
  output: {
    //path: path.resolve(__dirname, '/Your BrainDrive Dev/BrainDrive/backend/plugins/shared/BrainDriveEvaluator/v1.0.0/dist'),
    path: path.resolve(__dirname, 'dist'),
    publicPath: "auto",
    clean: true,
    library: {
      type: 'var',
      name: PLUGIN_NAME
    }
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      },
      {
        // Import .txt files as raw strings (for WhyFinder prompts)
        test: /\.txt$/,
        type: 'asset/source',
      }
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: PLUGIN_NAME,
      library: { type: "var", name: PLUGIN_NAME },
      filename: "remoteEntry.js",
      exposes: {
        [`./` + PLUGIN_NAME]: "./src/index",
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: deps.react,
          eager: true
        },
        "react-dom": {
          singleton: true,
          requiredVersion: deps["react-dom"],
          eager: true
        }
      }
    }),
    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
  ],
  devServer: {
    port: PLUGIN_PORT,
    static: {
      directory: path.join(__dirname, "public"),
    },
    hot: true,
  },
};