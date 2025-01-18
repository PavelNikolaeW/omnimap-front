const {merge} = require('webpack-merge');
const common = require('./webpack.common.js');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const path = require('path');

const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');


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
                test: /\.js$/, // Все файлы .js
                include: path.resolve(__dirname, 'src/js'), // Явно указываем, где искать .js файлы
                exclude: /node_modules/, // Исключаем папку node_modules
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                    },
                },
            },
            {
                test: /\.css$/,
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
            exclude: [/\.map$/, /\.txt$/], // Исключаем ненужные файлы из кэша
            runtimeCaching: [
                {
                    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'images-cache',
                        expiration: {
                            maxEntries: 20,
                            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 дней
                        },
                    },
                },
            ],
        }),
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

