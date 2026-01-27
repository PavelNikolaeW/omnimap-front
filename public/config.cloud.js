// Runtime configuration for cloud.ru dev environment
// Uses localhost proxy to avoid DNS issues with headless Chromium
// (*.omnimap.cloud.ru is only in /etc/hosts, not public DNS)
window.__OMNIMAP_CONFIG__ = {
    APP_BACKEND_URL: 'http://localhost:3000/cloud-api',
    LLM_GATEWAY_URL: 'http://llm.omnimap.cloud.ru',
    SINC_SERVICE_URL: 'ws://sync.omnimap.cloud.ru/ws'
};
