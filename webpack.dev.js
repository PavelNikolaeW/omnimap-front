const webpack = require('webpack');
const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'cheap-module-source-map',
    output: {
        // Используем hash вместо contenthash для более быстрой пересборки в dev
        filename: '[name].[fullhash].bundle.js',
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
                        ],
                        // Кэширование babel для ускорения пересборки
                        cacheDirectory: true,
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
        runtimeChunk: 'single',
        // Отключаем минимизацию в dev для ускорения
        minimize: false,
    },
    plugins: [
        new webpack.DefinePlugin({
            APP_BACKEND_URL: JSON.stringify(process.env.APP_BACKEND_URL || 'http://localhost:8000'),
            LLM_GATEWAY_URL: JSON.stringify(process.env.LLM_GATEWAY_URL || 'http://localhost:8001'),
            SINC_SERVICE_URL: JSON.stringify(process.env.SINC_SERVICE_URL || 'ws://localhost:7999/ws'),
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
