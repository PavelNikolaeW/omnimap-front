/**
 * Webpack config for verification against cloud.ru dev environment.
 * Replaces public/config.js with public/config.cloud.js in CopyPlugin.
 * Adds proxy for /cloud-api → api.omnimap.cloud.ru (bypasses DNS issues
 * with headless Chromium — *.omnimap.cloud.ru is only in /etc/hosts).
 * Does NOT modify webpack.common.js or webpack.dev.js.
 */
const CopyPlugin = require('copy-webpack-plugin');
const dev = require('./webpack.dev.js');

// Find and patch CopyPlugin to use config.cloud.js instead of config.js
dev.plugins = dev.plugins.map(plugin => {
    if (plugin instanceof CopyPlugin) {
        return new CopyPlugin({
            patterns: plugin.patterns.map(p => {
                if (typeof p === 'object' && p.from === 'public/config.js') {
                    return { ...p, from: 'public/config.cloud.js' };
                }
                return p;
            }),
        });
    }
    return plugin;
});

// Add proxy for API calls to cloud.ru backend
// Browser sends to localhost:3000/cloud-api/... → proxy to api.omnimap.cloud.ru/...
dev.devServer = dev.devServer || {};
dev.devServer.proxy = [
    {
        context: ['/cloud-api'],
        target: 'http://api.omnimap.cloud.ru',
        pathRewrite: { '^/cloud-api': '' },
        changeOrigin: true,
    }
];

module.exports = dev;
