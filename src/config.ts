// Конфигурация расширения
// В production режиме отключаются функции удаления данных

// Проверяем режим сборки
export const IS_DEV_MODE = import.meta.env.DEV || import.meta.env.MODE === 'development';
export const IS_PRODUCTION = import.meta.env.PROD || import.meta.env.MODE === 'production';

// Разрешить удаление данных только в dev режиме
// В production версии это всегда false для защиты данных
export const ALLOW_DELETE_DATA = IS_DEV_MODE && !IS_PRODUCTION;

