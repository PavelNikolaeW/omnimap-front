const webpack = require('webpack');
const {merge} = require('webpack-merge');
const common = require('./webpack.common.js');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
const path = require('path');

module.exports = merge(common, {
    mode: 'production',
    // Source maps для Sentry (hidden - не включаются в bundle, но загружаются в Sentry)
    devtool: process.env.SENTRY_AUTH_TOKEN ? 'hidden-source-map' : false,
    output: {
        filename: '[name].[contenthash].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: path.resolve(__dirname, 'src/js'),
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                        plugins: ['transform-remove-console'],
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
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css',
        }),
        new WorkboxWebpackPlugin.GenerateSW({
            clientsClaim: true,
            skipWaiting: true,
            cleanupOutdatedCaches: true,
            exclude: [/\.map$/, /\.txt$/, /service-worker\.js$/, /sw-custom\.js$/, /config\/config\.js$/, /config\.js$/, /force-update\.html$/],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            // Precaching: index.html будет доступен offline
            navigateFallback: '/index.html',
            // Regex должен матчить и /admin и /admin/ (с и без trailing slash)
            // force-update.html не должен редиректиться на index.html
            navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/admin(\/|$)/, /^\/static(\/|$)/, /^\/media(\/|$)/, /^\/force-update\.html/],
            // Подключаем кастомный код для Background Sync
            importScripts: ['sw-custom.js'],
            runtimeCaching: [
                // Runtime config - всегда пробуем сеть первой.
                // Поддерживаем оба URL: /config.js и /config/config.js.
                // Это предотвращает зависание на устаревшем конфиге в SW cache.
                {
                    urlPattern: /\/config(?:\/config)?\.js$/,
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'config-cache',
                        networkTimeoutSeconds: 2,
                        plugins: [],
                    },
                },
                // API кэширование для offline доступа
                {
                    urlPattern: /\/api\/v1\/load-trees\/?$/,
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'api-trees-cache',
                        networkTimeoutSeconds: 5,
                        expiration: {
                            maxEntries: 10,
                            maxAgeSeconds: 24 * 60 * 60, // 1 день
                        },
                        cacheableResponse: {
                            statuses: [0, 200],
                        },
                    },
                },
                {
                    urlPattern: /\/api\/v1\/block\/.+\/?$/,
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'api-blocks-cache',
                        networkTimeoutSeconds: 5,
                        expiration: {
                            maxEntries: 50,
                            maxAgeSeconds: 24 * 60 * 60, // 1 день
                        },
                        cacheableResponse: {
                            statuses: [0, 200],
                        },
                    },
                },
                {
                    urlPattern: /\/api\/v1\/health\/?$/,
                    handler: 'NetworkOnly',
                    options: {
                        cacheName: 'api-health-cache',
                    },
                },
                // Изображения
                {
                    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'images-cache',
                        expiration: {
                            maxEntries: 50,
                            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 дней
                        },
                    },
                },
                // HTML документы (исключая force-update.html)
                {
                    urlPattern: ({request, url}) => {
                        return request.destination === 'document' && !url.pathname.includes('force-update.html');
                    },
                    handler: 'NetworkFirst',
                    options: {
                        cacheName: 'html-cache',
                        networkTimeoutSeconds: 3,
                    },
                },
                // JS и CSS с contenthash — используем CacheFirst
                // (хеш в имени гарантирует что файл уникален, перекачивать не нужно)
                {
                    urlPattern: ({request, url}) =>
                        (request.destination === 'script' || request.destination === 'style') &&
                        url.pathname !== '/config.js' &&
                        url.pathname !== '/config/config.js',
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'static-resources',
                        expiration: {
                            maxEntries: 100,
                            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 дней
                        },
                    },
                },
                // Шрифты
                {
                    urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'fonts-cache',
                        expiration: {
                            maxEntries: 20,
                            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 год
                        },
                    },
                },
            ],
        }),
        new webpack.DefinePlugin({
            APP_BACKEND_URL: JSON.stringify(process.env.APP_BACKEND_URL || 'https://omnimap.ru'),
            SINC_SERVICE_URL: JSON.stringify(process.env.SINC_SERVICE_URL || 'wss://omnimap.ru/ws'),
            LLM_GATEWAY_URL: JSON.stringify(process.env.LLM_GATEWAY_URL || 'https://omnimap.ru/llm'),
            APP_VERSION: JSON.stringify(process.env.APP_VERSION || 'dev'),
            APP_BUILD_TIME: JSON.stringify(new Date().toISOString()),
            // Sentry DSN (может быть переопределён через runtime config)
            SENTRY_DSN: JSON.stringify(process.env.SENTRY_DSN || ''),
        }),
        // Sentry webpack plugin для загрузки source maps
        // Активируется только при наличии SENTRY_AUTH_TOKEN
        ...(process.env.SENTRY_AUTH_TOKEN ? [
            sentryWebpackPlugin({
                org: process.env.SENTRY_ORG || 'omnimap',
                project: process.env.SENTRY_PROJECT || 'omnimap-front',
                authToken: process.env.SENTRY_AUTH_TOKEN,
                release: {
                    name: `omnimap-front@${process.env.APP_VERSION || 'dev'}`,
                },
                sourcemaps: {
                    assets: './dist/**/*.js',
                    filesToDeleteAfterUpload: './dist/**/*.js.map',
                },
                // Не прерывать build при ошибке загрузки
                errorHandler: (err, invokeErr, compilation) => {
                    compilation.warnings.push('Sentry source maps upload failed: ' + err.message);
                },
            }),
        ] : [])
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true,
                        drop_debugger: true,
                    },
                    mangle: {
                        safari10: true,
                    },
                    output: {
                        comments: false,
                    },
                },
                extractComments: false,
            }),
            new CssMinimizerPlugin(),
        ],
        splitChunks: {
            chunks: 'all',
            maxInitialRequests: 5,
            maxSize: 500000,
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
        runtimeChunk: 'single',
    },
});
