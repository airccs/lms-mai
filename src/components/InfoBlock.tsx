import React from 'react';
import { LucideIcon } from 'lucide-react';

interface InfoBlockProps {
  number: number;
  title: string;
  description?: string;
  icon?: LucideIcon;
  highlight?: boolean;
}

export const InfoBlock: React.FC<InfoBlockProps> = ({
  number,
  title,
  description,
  icon: Icon,
  highlight,
}) => {
  return (
    <div
      className={`flex gap-3 p-2 rounded-md bg-white border border-slate-100 shadow-sm transition-transform hover:scale-[1.01] ${
        highlight ? 'bg-amber-50 border-amber-200' : ''
      }`}
    >
      <span className="flex items-center justify-center w-6 h-6 text-xs font-semibold text-slate-500 bg-slate-100 rounded flex-shrink-0">
        {number}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-slate-600" />}
          <div className="text-sm font-medium text-slate-700">{title}</div>
        </div>
        {description && (
          <div className="text-xs text-slate-500 mt-0.5">{description}</div>
        )}
      </div>
    </div>
  );
};

