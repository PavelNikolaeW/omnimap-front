/**
 * Onboarding Module
 *
 * Система обучения новых пользователей OmniMap:
 * - Туториальный граф блоков
 * - Контекстные подсказки
 * - Welcome баннер
 */

// Основной менеджер онбординга
export { onboardingManager, OnboardingManager } from './OnboardingManager';

// Конфигурация подсказок
export { CONTEXTUAL_HINTS } from './hints';

// Туториальный граф
export { getTutorialBlocks, TUTORIAL_STRUCTURE } from './tutorialGraph';

// Welcome баннер
export { welcomeBanner } from './welcomeBanner';

// Экспорт в window для доступа из консоли браузера
// Использование: onboardingManager.reset() для сброса онбординга
import { onboardingManager as _om } from './OnboardingManager';
if (typeof window !== 'undefined') {
    window.onboardingManager = _om;
}
