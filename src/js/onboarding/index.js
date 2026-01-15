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
