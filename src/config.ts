// Конфигурация расширения
// В production режиме отключаются функции удаления данных

// Проверяем режим сборки
// В production сборке import.meta.env.PROD будет true
// В development сборке import.meta.env.DEV будет true
const isProduction = import.meta.env.PROD === true || import.meta.env.MODE === 'production';
const isDevelopment = import.meta.env.DEV === true || import.meta.env.MODE === 'development';

export const IS_DEV_MODE = isDevelopment && !isProduction;
export const IS_PRODUCTION = isProduction;

// Разрешить удаление данных только в dev режиме
// В production версии это всегда false для защиты данных
// По умолчанию false для безопасности
export const ALLOW_DELETE_DATA = IS_DEV_MODE;

