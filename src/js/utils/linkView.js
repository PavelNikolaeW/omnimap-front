/**
 * Определяет режим просмотра по ссылке (legacy формат /?slug).
 * Служебные query-параметры (например forceUpdate=1) НЕ считаются link view.
 */

const LINK_SLUG_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

export function getLinkSlugFromSearch(search = window.location.search) {
    if (!search || search === '?') {
        return null;
    }

    const raw = search.startsWith('?') ? search.slice(1) : search;
    if (!raw) {
        return null;
    }

    // Если есть key=value параметры, это не формат legacy share-link.
    if (raw.includes('=')) {
        return null;
    }

    return LINK_SLUG_PATTERN.test(raw) ? raw : null;
}

export function isLinkViewSearch(search = window.location.search) {
    return getLinkSlugFromSearch(search) !== null;
}
