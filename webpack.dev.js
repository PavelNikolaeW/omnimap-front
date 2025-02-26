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
    optimization: {
        runtimeChunk: 'single', // Добавляем runtime для разработки
    },
});