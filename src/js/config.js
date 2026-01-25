/**
 * Runtime configuration loader
 * Gets config from window.__OMNIMAP_CONFIG__ (set by /config/config.js mounted via ConfigMap)
 * Falls back to build-time env variables (from webpack DefinePlugin) for development
 */

// Build-time variables from webpack DefinePlugin (declared as globals)
/* global APP_BACKEND_URL, LLM_GATEWAY_URL, SINC_SERVICE_URL, SENTRY_DSN */

function getConfig() {
    const runtimeConfig = window.__OMNIMAP_CONFIG__ || {};

    // Priority: runtime config (from ConfigMap) > build-time env (webpack) > localhost defaults
    const backendUrl = runtimeConfig.APP_BACKEND_URL ||
        (typeof APP_BACKEND_URL !== 'undefined' ? APP_BACKEND_URL : 'http://localhost:8000');
    const llmUrl = runtimeConfig.LLM_GATEWAY_URL ||
        (typeof LLM_GATEWAY_URL !== 'undefined' ? LLM_GATEWAY_URL : 'http://localhost:8001');
    const sincUrl = runtimeConfig.SINC_SERVICE_URL ||
        (typeof SINC_SERVICE_URL !== 'undefined' ? SINC_SERVICE_URL : 'ws://localhost:7999/ws');

    // Error tracking configuration
    const sentryDsn = runtimeConfig.SENTRY_DSN ||
        (typeof SENTRY_DSN !== 'undefined' ? SENTRY_DSN : '');
    const errorTrackingEnabled = runtimeConfig.ERROR_TRACKING_ENABLED !== false;

    return {
        APP_BACKEND_URL: backendUrl.replace(/\/+$/, ''),
        LLM_GATEWAY_URL: llmUrl.replace(/\/+$/, ''),
        SINC_SERVICE_URL: sincUrl,
        // Error tracking
        SENTRY_DSN: sentryDsn,
        ERROR_TRACKING_ENABLED: errorTrackingEnabled,
    };
}

export const config = getConfig();
export default config;
