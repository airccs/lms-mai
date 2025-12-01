# Переключение API URL в расширении

## Способ 1: Через Chrome DevTools Console

1. Откройте расширение в Chrome
2. Нажмите F12 (DevTools)
3. Перейдите на вкладку **Console**
4. Выполните команду:

```javascript
// Для локального сервера
chrome.storage.local.set({ apiUrl: 'http://localhost:3000' });

// Для Oracle сервера (текущий)
chrome.storage.local.set({ apiUrl: 'http://130.61.200.70:3000' });

// Вернуться к Oracle Cloud серверу (по умолчанию)
chrome.storage.local.set({ apiUrl: 'http://130.61.200.70:3000' });
```

5. Перезагрузите расширение (chrome://extensions → кнопка обновления)

## Способ 2: Временное изменение в коде

1. Откройте `js/background.js`
2. Найдите строку:
```javascript
const defaultApiUrl = 'http://130.61.200.70:3000';
```
3. Измените на:
```javascript
const defaultApiUrl = 'http://localhost:3000';  // или ваш Oracle сервер
```
4. Пересоберите расширение: `npm run build:prod`

## Проверка текущего URL

В Chrome DevTools Console:
```javascript
chrome.storage.local.get(['apiUrl'], (result) => {
  console.log('Текущий API URL:', result.apiUrl || 'по умолчанию (Oracle Cloud)');
});
```

## Сброс к настройкам по умолчанию

```javascript
chrome.storage.local.remove('apiUrl');
```

