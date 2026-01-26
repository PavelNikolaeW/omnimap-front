const webpack = require('webpack');
const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// webpack-dev-server устанавливает WEBPACK_SERVE=true автоматически
const isServe = process.env.WEBPACK_SERVE === 'true';
// Для serve — style-loader (HMR), для build — MiniCssExtractPlugin (статические CSS файлы для nginx)
const cssFirstLoader = isServe ? 'style-loader' : MiniCssExtractPlugin.loader;

module.exports = merge(common, {
    mode: 'development',
    devtool: 'cheap-module-source-map',
    output: {
        filename: '[name].[fullhash].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    devServer: {
        static: './dist',
        port: 3000,
        hot: true,
        historyApiFallback: true,
        // Агрессивное отключение кэширования для dev режима
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
        watchFiles: ['src/**/*'],
        // Автоматически открывает браузер
        // open: true,
        // Перезагрузка при изменении статических файлов
        liveReload: true,
        // Показывать ошибки компиляции в браузере
        client: {
            overlay: {
                errors: true,
                warnings: false,
            },
            progress: true,
        },
    },
    module: {
        rules: [
            // JavaScript/JSX
            {
                test: /\.js$/,
                include: path.resolve(__dirname, 'src/js'),
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                        cacheDirectory: true,
                    }
                }
            },
            // CSS Modules (for *.module.css files)
            {
                test: /\.module\.css$/,
                use: [
                    cssFirstLoader,
                    {
                        loader: 'css-loader',
                        options: {
                            modules: {
                                namedExport: false,
                                exportLocalsConvention: 'as-is'
                            }
                        }
                    }
                ],
            },
            // Regular CSS (non-module)
            {
                test: /\.css$/,
                exclude: /\.module\.css$/,
                use: [cssFirstLoader, 'css-loader'],
            },
        ],
    },
    optimization: {
        runtimeChunk: 'single',
        // Отключаем минимизацию в dev для ускорения
        minimize: false,
    },
    plugins: [
        // CSS extraction в файлы (только при build, не при serve)
        ...(!isServe ? [
            new MiniCssExtractPlugin({
                filename: '[name].[fullhash].css',
            }),
        ] : []),
        new webpack.DefinePlugin({
            APP_BACKEND_URL: JSON.stringify(process.env.APP_BACKEND_URL || 'http://localhost:8000'),
            LLM_GATEWAY_URL: JSON.stringify(process.env.LLM_GATEWAY_URL || 'http://localhost:8001'),
            SINC_SERVICE_URL: JSON.stringify(process.env.SINC_SERVICE_URL || 'ws://localhost:7999/ws'),
            APP_VERSION: JSON.stringify(process.env.APP_VERSION || 'dev'),
            APP_BUILD_TIME: JSON.stringify(new Date().toISOString()),
            // Флаг для отключения Service Worker в dev режиме
            'process.env.NODE_ENV': JSON.stringify('development'),
        })
    ],
    // Кэширование для ускорения повторных сборок
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        },
    },
});
