# Настройка React для Popup

## Установка зависимостей

```bash
npm install
```

## Разработка

```bash
npm run dev
```

Это запустит сборку в режиме watch - файлы будут автоматически пересобираться при изменениях.

## Сборка для production

```bash
npm run build
```

Собранные файлы будут в папке `html/`:
- `html/popup.html` - HTML файл
- `html/js/popup.js` - JavaScript bundle
- `html/css/popup.css` - CSS стили

## Обновление manifest.json

После сборки обновите `manifest.json`:

```json
{
  "action": {
    "default_popup": "html/popup.html"
  }
}
```

## Структура проекта

```
src/
  popup/
    index.html    # Точка входа
    popup.tsx     # React root
    App.tsx       # Главный компонент
    popup.css     # Tailwind CSS
  components/
    Section.tsx
    InfoBlock.tsx
    StatsChart.tsx
```

