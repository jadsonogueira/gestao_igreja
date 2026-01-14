'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function Checkbox({ label, checked, onChange, disabled }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          'w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center',
          checked
            ? 'bg-blue-600 border-blue-600'
            : 'border-gray-300 hover:border-blue-500'
        )}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}
