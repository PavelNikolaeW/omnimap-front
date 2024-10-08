const {merge} = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map',
    devServer: {
        static: './dist',
        hot: true,
        headers: {
            'Cache-Control': 'no-store',
        },
        watchFiles: ['src/**/*'], // Убедитесь, что Webpack отслеживает только нужные файлы
    },
});
