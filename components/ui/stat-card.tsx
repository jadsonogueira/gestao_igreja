'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
  delay?: number;
}

const colorClasses = {
  blue: 'from-blue-500 to-blue-600 shadow-blue-200',
  green: 'from-emerald-500 to-emerald-600 shadow-emerald-200',
  yellow: 'from-amber-500 to-amber-600 shadow-amber-200',
  red: 'from-rose-500 to-rose-600 shadow-rose-200',
  purple: 'from-purple-500 to-purple-600 shadow-purple-200',
  indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-200',
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium mb-1">{title ?? ''}</p>
          <motion.h3
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-3xl font-bold text-gray-900"
          >
            {value ?? 0}
          </motion.h3>
        </div>
        <div
          className={cn(
            'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg',
            colorClasses[color] ?? colorClasses.blue
          )}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
}
