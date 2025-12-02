#!/usr/bin/env node

/**
 * Скрипт для сборки production версии расширения
 * Создает папку dist/ с готовым к распространению расширением
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = 'dist';
const EXTENSION_NAME = 'LMS-MAI-Quiz-Solver';

console.log('🚀 Начинаю сборку production версии расширения...\n');

// Очищаем папку dist
if (fs.existsSync(DIST_DIR)) {
    console.log('📁 Очищаю папку dist/...');
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Список файлов и папок для копирования
const filesToCopy = [
    'manifest.json',
    'js',
    'css',
    'html',
    'icons',
    '_locales'
];

// Копируем файлы
console.log('📋 Копирую файлы расширения...');
filesToCopy.forEach(item => {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(__dirname, DIST_DIR, item);
    
    if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
            fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
        console.log(`  ✓ ${item}`);
    } else {
        console.warn(`  ⚠ ${item} не найден`);
    }
});

// Собираем React компоненты
console.log('\n⚛️  Собираю React компоненты...');
try {
    execSync('npm run build:prod', { stdio: 'inherit' });
    console.log('  ✓ React компоненты собраны');
} catch (error) {
    console.error('  ✗ Ошибка при сборке React компонентов:', error.message);
    process.exit(1);
}

// Проверяем, что IS_DEV_MODE везде false
console.log('\n🔍 Проверяю настройки production режима...');
const filesToCheck = [
    { path: 'js/background.js', pattern: /const IS_DEV_MODE = (true|false)/ },
    { path: 'js/saved-data.js', pattern: /const IS_DEV_MODE = (true|false)/ },
    { path: 'src/config.ts', pattern: /export const IS_DEV_MODE = (true|false)/ },
    { path: 'src/config.ts', pattern: /export const ALLOW_DELETE_DATA = (true|false)/ }
];

let allGood = true;
filesToCheck.forEach(({ path: filePath, pattern }) => {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const match = content.match(pattern);
        if (match) {
            const value = match[1] === 'true';
            if (value) {
                console.error(`  ✗ ${filePath}: IS_DEV_MODE или ALLOW_DELETE_DATA установлен в true!`);
                allGood = false;
            } else {
                console.log(`  ✓ ${filePath}: правильно настроен`);
            }
        }
    }
});

if (!allGood) {
    console.error('\n❌ Обнаружены проблемы с настройками production режима!');
    process.exit(1);
}

// Создаем README для пользователей
console.log('\n📝 Создаю README для пользователей...');
const readmeContent = `# LMS MAI Quiz Solver

Расширение для браузера Chrome/Edge, помогающее решать тесты в Moodle LMS.

## Установка

1. Распакуйте эту папку в любое удобное место на вашем компьютере
2. Откройте браузер Chrome или Edge
3. Перейдите в настройки расширений:
   - Chrome: chrome://extensions/
   - Edge: edge://extensions/
4. Включите "Режим разработчика" (Developer mode) в правом верхнем углу
5. Нажмите "Загрузить распакованное расширение" (Load unpacked)
6. Выберите папку с расширением

## Использование

1. Откройте сайт LMS MAI (https://lms.mai.ru/)
2. Войдите в систему
3. Расширение автоматически активируется на страницах тестов
4. Нажмите на иконку расширения в панели инструментов для доступа к сохраненным данным

## Возможности

- Автоматическое сохранение вопросов и ответов
- Автоматическое сканирование тестов
- Показ правильности ответов на основе статистики
- Экспорт сохраненных данных

## Версия

${require('./package.json').version}

## Поддержка

При возникновении проблем обратитесь к разработчику.
`;

fs.writeFileSync(path.join(__dirname, DIST_DIR, 'README.txt'), readmeContent, 'utf8');
console.log('  ✓ README.txt создан');

// Создаем .gitignore для dist
fs.writeFileSync(path.join(__dirname, DIST_DIR, '.gitignore'), '*\n', 'utf8');

console.log('\n✅ Production версия успешно собрана!');
console.log(`📦 Папка: ${DIST_DIR}/`);
console.log('\n📌 Следующие шаги:');
console.log('  1. Заархивируйте папку dist/ в ZIP файл');
console.log('  2. Распространите ZIP файл среди пользователей');
console.log('  3. Пользователи должны распаковать ZIP и загрузить расширение в браузер\n');

