const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './src/js/index.js',
    output: {
        filename: '[name].[contenthash].bundle.js', // Добавили contenthash для кэширования
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    resolve: {
        alias: {
            '@js': path.resolve(__dirname, 'src/js'), // Создаем алиас для папки src/js
        },
        extensions: ['.js', '.jsx', '.json'], // Расширения файлов, которые Webpack будет пытаться найти
    },
    module: {
        rules: [
            // JavaScript/JSX (for React components in llm_chat submodule)
            {
                test: /\.(js|jsx)$/,
                include: [
                    path.resolve(__dirname, 'src/js'),
                    path.resolve(__dirname, 'src/llm_chat')
                ],
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
            // Изображения
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: 'asset',
                parser: {
                    dataUrlCondition: {
                        maxSize: 8 * 1024, // Изображения меньше 8 KB будут встраиваться как base64
                    },
                },
            },
            // Шрифты
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html',
            minify: {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true,
            },
        }),
    ],
};