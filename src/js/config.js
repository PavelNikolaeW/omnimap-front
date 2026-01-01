/**
 * Runtime configuration loader
 * Gets config from window.__OMNIMAP_CONFIG__ (set by /config.js)
 * Falls back to build-time env variables for development
 */

function getConfig() {
    const runtimeConfig = window.__OMNIMAP_CONFIG__ || {};

    return {
        APP_BACKEND_URL: (runtimeConfig.APP_BACKEND_URL || APP_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, ''),
        LLM_GATEWAY_URL: (runtimeConfig.LLM_GATEWAY_URL || LLM_GATEWAY_URL || 'http://localhost:8001').replace(/\/+$/, ''),
        SINC_SERVICE_URL: runtimeConfig.SINC_SERVICE_URL || SINC_SERVICE_URL || 'ws://localhost:7999/ws'
    };
}

export const config = getConfig();
export default config;
