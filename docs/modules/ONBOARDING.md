# Onboarding Module

Система обучения OmniMap состоит из трёх частей:
- приветственный баннер (`welcomeBanner`)
- контекстные подсказки (`hints`)
- учебное дерево блоков (`tutorialGraph`)

Основной оркестратор: `src/js/onboarding/OnboardingManager.js`.

## Файлы

| File | Purpose |
|------|---------|
| `src/js/onboarding/OnboardingManager.js` | Инициализация онбординга, подписка на события, показ подсказок |
| `src/js/onboarding/hints.js` | Конфигурация контекстных подсказок (триггер, текст, условия) |
| `src/js/onboarding/tutorialGraph.js` | Структура обучающего дерева |
| `src/js/onboarding/welcomeBanner.js` | Welcome-баннер для новых пользователей |
| `src/js/services/homePageInitializer.js` | Создание tutorial-дерева через API при первом запуске |

## OnboardingManager API

```js
import { onboardingManager } from './onboarding';

onboardingManager.init();
onboardingManager.isNewUser();
onboardingManager.getTutorialData();
onboardingManager.showHint('Текст подсказки', 4000);
onboardingManager.hideHint();
onboardingManager.completeOnboarding();
onboardingManager.dismissTutorial();
onboardingManager.reset();     // для тестирования
onboardingManager.destroy();   // очистка listeners/DOM
```

Важно:
- `showHint()` принимает текст, а не `hintId`
- подписка на события делается автоматически на основе `CONTEXTUAL_HINTS`

## LocalStorage ключи

| Key | Purpose |
|-----|---------|
| `__omnimap_onboarding_completed__` | онбординг завершён |
| `__omnimap_hints_shown__` | массив уже показанных подсказок |
| `__omnimap_tutorial_dismissed__` | пользователь пропустил tutorial |

## Как работают подсказки

Каждая подсказка в `hints.js` содержит:
- `trigger`: имя `window` события
- `message`: текст подсказки
- `showOnce`: показывать только один раз
- `level`: уровень сложности
- `condition` (optional): дополнительная проверка
- `duration` (optional): длительность показа

`OnboardingManager` подписывается на все `trigger` из `CONTEXTUAL_HINTS` и показывает подсказку при событии.

## Актуальные категории подсказок

- База: создание блока, навигация, поиск, текстовый редактор
- Организация: цвета, copy/paste, paste-link, undo, импорт, изображения
- Визуализация: режим соединений, создание соединений, diagram mode, layout editor
- Совместная работа: доступы, чаты, reminders, subscriptions, focus, notification settings, access requests

## Где диспатчатся onboarding события

Ключевые команды, где добавлены триггеры:
- `src/js/controller/comands/commands.js`  
  `OpenNoteEditor`, `OpenUnifiedChat`, `EnterConnectMode`
- `src/js/controller/comands/popupsCmd.js`  
  `OpenSearchPopup`, `OpenAccessPopup`, `OpenImportPopup`, `OpenImageUploadPopup`, `OpenReminderPopup`, `WatchBlock`, `OpenNotificationSettings`, `OpenAccessRequestsManager`, `OpenFocusContainerPopup`, `MarkAsFocusContainer`
- `src/js/controller/comands/layoutCommands.js`  
  `OpenLayoutEditor`
- `src/js/controller/comands/uiManager.js`  
  `EnterDiagramMode`

## Tutorial Graph

`tutorialGraph.js` хранит структуру обучающего дерева (`TUTORIAL_STRUCTURE`).

Текущее покрытие:
- быстрый старт
- home page
- focus system
- права доступа
- layout editor
- организация блоков
- совместная работа
- дополнительные инструменты (images, URL, import, access requests, notification settings)

## Инициализация tutorial для нового пользователя

Логика в `src/js/services/homePageInitializer.js`:
1. Проверяет `api.getOnboardingStatus()`
2. Если onboarding не завершён, создаёт tutorial-дерево
3. Импортирует блоки из `TUTORIAL_STRUCTURE`
4. Помечает onboarding завершённым через `api.completeOnboarding()`

## Как добавить новую подсказку

1. Добавить запись в `src/js/onboarding/hints.js`:

```js
myHint: {
  trigger: 'MyEvent',
  message: 'Описание',
  showOnce: true,
  level: 3
}
```

2. Убедиться, что `dispatch('MyEvent')` вызывается в нужном месте команды/сервиса.

## Как добавить новый раздел tutorial

1. Добавить блоки в `TUTORIAL_BLOCKS` в `src/js/onboarding/tutorialGraph.js`
2. Включить новый раздел в `root.children`
3. Проверить, что тексты и хоткеи соответствуют текущим командам
