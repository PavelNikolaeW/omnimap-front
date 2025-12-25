const webpack = require('webpack');
const {merge} = require('webpack-merge');
const common = require('./webpack.common.js');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const path = require('path');

module.exports = merge(common, {
    mode: 'production',
    output: {
        filename: '[name].[contenthash].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/, // JS and JSX files
                include: [
                    path.resolve(__dirname, 'src/js'),
                    path.resolve(__dirname, 'src/llm_chat')
                ],
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-env',
                            ['@babel/preset-react', { runtime: 'automatic' }]
                        ],
                    },
                },
            },
            // CSS Modules (for *.module.css files)
            {
                test: /\.module\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
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
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ],
    },
    plugins: [
        // Вынос CSS в отдельный файл
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css',
        }),
        // Настройка Service Worker
        new WorkboxWebpackPlugin.GenerateSW({
            clientsClaim: true,
            skipWaiting: true,
            cleanupOutdatedCaches: true, // Удаляет старые кэши при обновлении
            exclude: [/\.map$/, /\.txt$/, /service-worker\.js$/],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            // Не кэшируем index.html в precache - используем только runtime
            navigateFallback: null,
            runtimeCaching: [
                {
                    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'images-cache',
                        expiration: {
                            maxEntries: 20,
                            maxAgeSeconds: 30 * 24 * 60 * 60,
                        },
                    },
                },
                {
                    // HTML всегда сначала сеть
                    urlPattern: ({request}) => request.destination === 'document',
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'html-cache',
                        networkTimeoutSeconds: 3, // Таймаут 3 сек, потом кэш
                    },
                },
                {
                    urlPattern: ({request}) => request.destination === 'script' || request.destination === 'style',
                    handler: 'StaleWhileRevalidate',
                    options: {
                        cacheName: 'static-resources',
                    },
                },
            ],
        }),
        new webpack.DefinePlugin({
            APP_BACKEND_URL: JSON.stringify(process.env.APP_BACKEND_URL || 'https://omnimap.ru'),
            SINC_SERVICE_URL: JSON.stringify(process.env.SINC_SERVICE_URL || 'wss://omnimap.ru/ws'),
            LLM_GATEWAY_URL: JSON.stringify(process.env.LLM_GATEWAY_URL || 'https://llm.omnimap.ru')
        })
    ],
    optimization: {
        // Минификация JS и CSS
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true, // Удаляем console.log
                    },
                },
            }),
            new CssMinimizerPlugin(),
        ],
        // Разделение кода
        splitChunks: {
            chunks: 'all',
            maxInitialRequests: 5, // Уменьшаем количество одновременных загрузок
            maxSize: 500000, // Лимит размера чанков (в байтах)
            cacheGroups: {
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: -10,
                },
                default: {
                    minChunks: 2,
                    priority: -20,
                    reuseExistingChunk: true,
                },
            },
        },
        runtimeChunk: 'single', // Вынос runtime в отдельный файл
    },
});

