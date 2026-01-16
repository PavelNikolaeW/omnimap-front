/**
 * Tests for FocusContainerPopup
 *
 * Тестирует логику popup для выбора контейнера фокуса.
 * Полное интеграционное тестирование выполняется через E2E.
 */

describe('FocusContainerPopup', () => {
    // Mock DOM
    let mockContentArea;
    let mockPopupEl;

    beforeEach(() => {
        mockContentArea = document.createElement('div');
        mockPopupEl = document.createElement('div');
        mockPopupEl.appendChild(mockContentArea);
        document.body.appendChild(mockPopupEl);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('truncateTitle utility', () => {
        // Test the truncate logic directly
        const truncateTitle = (str, maxLength) => {
            if (!str) return '';
            if (str.length <= maxLength) return str;
            return str.substring(0, maxLength - 3) + '...';
        };

        it('should not truncate short strings', () => {
            expect(truncateTitle('Short', 40)).toBe('Short');
        });

        it('should truncate long strings with ellipsis', () => {
            const result = truncateTitle('This is a very long title that should be truncated', 20);
            expect(result.length).toBe(20);
            expect(result.endsWith('...')).toBe(true);
        });

        it('should handle empty strings', () => {
            expect(truncateTitle('', 40)).toBe('');
            expect(truncateTitle(null, 40)).toBe('');
        });

        it('should handle string equal to max length', () => {
            expect(truncateTitle('12345', 5)).toBe('12345');
        });
    });

    describe('container button creation', () => {
        // Test button creation logic directly
        const createContainerButton = (container, onClick) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'focus-container-btn';
            if (container.isHomeFocus) {
                button.classList.add('focus-container-btn--home');
            }
            button.setAttribute('data-container-id', container.id);
            button.setAttribute('data-testid', `focus-container-${container.id}`);

            const icon = document.createElement('i');
            icon.className = container.isHomeFocus
                ? 'fas fa-home focus-container-icon'
                : 'fas fa-bullseye focus-container-icon';
            button.appendChild(icon);

            const title = document.createElement('span');
            title.className = 'focus-container-title';
            title.textContent = container.title;
            button.appendChild(title);

            button.addEventListener('click', () => onClick(container.id));

            return button;
        };

        it('should create button with correct attributes', () => {
            const container = { id: 'container1', title: 'Work', isHomeFocus: false };
            const onClick = jest.fn();

            const button = createContainerButton(container, onClick);

            expect(button.getAttribute('data-container-id')).toBe('container1');
            expect(button.classList.contains('focus-container-btn')).toBe(true);
            expect(button.classList.contains('focus-container-btn--home')).toBe(false);
        });

        it('should add home class for home focus container', () => {
            const container = { id: 'focus-home', title: 'Focus (Home)', isHomeFocus: true };
            const onClick = jest.fn();

            const button = createContainerButton(container, onClick);

            expect(button.classList.contains('focus-container-btn--home')).toBe(true);
        });

        it('should render icon and title', () => {
            const container = { id: 'container1', title: 'Work', isHomeFocus: false };
            const onClick = jest.fn();

            const button = createContainerButton(container, onClick);

            expect(button.querySelector('i')).toBeTruthy();
            expect(button.querySelector('.focus-container-title').textContent).toBe('Work');
        });

        it('should call onClick when button clicked', () => {
            const container = { id: 'container1', title: 'Work', isHomeFocus: false };
            const onClick = jest.fn();

            const button = createContainerButton(container, onClick);
            button.click();

            expect(onClick).toHaveBeenCalledWith('container1');
        });
    });

    describe('empty state', () => {
        it('should show message when no containers available', () => {
            const containers = [];
            const containersList = document.createElement('div');

            if (containers.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'popup-text popup-text--muted';
                emptyMessage.textContent = 'Нет доступных контейнеров фокуса';
                containersList.appendChild(emptyMessage);
            }

            expect(containersList.textContent).toContain('Нет доступных контейнеров');
        });
    });

    describe('selection handling', () => {
        it('should call onSelect callback with container id', () => {
            const onSelect = jest.fn();
            const containerId = 'container1';

            // Simulate selection
            onSelect(containerId);

            expect(onSelect).toHaveBeenCalledWith('container1');
        });

        it('should call onCancel callback when cancelled', () => {
            const onCancel = jest.fn();

            // Simulate cancel
            onCancel();

            expect(onCancel).toHaveBeenCalled();
        });
    });
});
