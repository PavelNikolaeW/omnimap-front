import { getLinkSlugFromSearch, isLinkViewSearch } from '../../utils/linkView';

describe('linkView utils', () => {
    test('detects valid legacy link slug', () => {
        expect(getLinkSlugFromSearch('?abc123')).toBe('abc123');
        expect(isLinkViewSearch('?abc123')).toBe(true);
    });

    test('does not treat key-value query as link view', () => {
        expect(getLinkSlugFromSearch('?forceUpdate=1')).toBeNull();
        expect(isLinkViewSearch('?forceUpdate=1')).toBe(false);
    });

    test('does not treat service update params as link view', () => {
        expect(getLinkSlugFromSearch('?_reload=1&_t=123')).toBeNull();
        expect(isLinkViewSearch('?_reload=1&_t=123')).toBe(false);
    });

    test('rejects invalid or too short slug', () => {
        expect(getLinkSlugFromSearch('')).toBeNull();
        expect(getLinkSlugFromSearch('?')).toBeNull();
        expect(getLinkSlugFromSearch('?a')).toBeNull();
        expect(isLinkViewSearch('?a')).toBe(false);
    });

    test('rejects unsupported characters in slug', () => {
        expect(getLinkSlugFromSearch('?chat/dm/1')).toBeNull();
        expect(getLinkSlugFromSearch('?hello world')).toBeNull();
    });
});
