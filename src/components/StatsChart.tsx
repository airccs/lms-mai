import React from 'react';

interface StatsChartProps {
  saved: number;
  total: number;
  attempts: number;
}

export const StatsChart: React.FC<StatsChartProps> = ({ saved, total, attempts }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="space-y-2">
        <div className="flex justify-between items-center py-2 border-b border-slate-200 last:border-b-0">
          <span className="text-sm text-slate-600">Сохранено ответов:</span>
          <span className="text-base font-semibold text-slate-900">{saved}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-200 last:border-b-0">
          <span className="text-sm text-slate-600">Вопросов в базе:</span>
          <span className="text-base font-semibold text-slate-900">{total}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-slate-600">Всего попыток:</span>
          <span className="text-base font-semibold text-slate-900">{attempts}</span>
        </div>
      </div>
    </div>
  );
};

