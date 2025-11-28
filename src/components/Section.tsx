import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SectionProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, icon: Icon, children }) => {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4" />}
        {title}
      </h2>
      {children}
    </section>
  );
};

