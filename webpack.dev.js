const webpack = require('webpack');
const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'cheap-module-source-map',
    devServer: {
        static: './dist',
        hot: true,
        headers: {
            'Cache-Control': 'no-store',
        },
        watchFiles: ['src/**/*'], // Отслеживаем только файлы в папке src
    },
    module: {
        rules: [
            // JavaScript/JSX
            {
                test: /\.(js|jsx)$/,
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
                        ]
                    }
                }
            },
            // CSS Modules (for *.module.css files)
            {
                test: /\.module\.css$/,
                use: [
                    'style-loader',
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
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    optimization: {
        runtimeChunk: 'single', // Добавляем runtime для разработки
    },
    plugins: [
        new webpack.DefinePlugin({
            APP_BACKEND_URL: JSON.stringify(process.env.APP_BACKEND_URL || 'http://localhost:8000/'),
            LLM_GATEWAY_URL: JSON.stringify(process.env.LLM_GATEWAY_URL || 'http://localhost:8001'),
            SINC_SERVICE_URL: JSON.stringify(process.env.SINC_SERVICE_URL || 'ws://localhost:7999/ws')
        })
    ]
});