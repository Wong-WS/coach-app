'use client';

import { useState, useEffect } from 'react';

const COUNTRY_CODES = [
  { code: '+60', label: '🇲🇾 +60', country: 'MY' },
  { code: '+65', label: '🇸🇬 +65', country: 'SG' },
  { code: '+82', label: '🇰🇷 +82', country: 'KR' },
  { code: '+81', label: '🇯🇵 +81', country: 'JP' },
  { code: '+86', label: '🇨🇳 +86', country: 'CN' },
  { code: '+852', label: '🇭🇰 +852', country: 'HK' },
  { code: '+886', label: '🇹🇼 +886', country: 'TW' },
  { code: '+66', label: '🇹🇭 +66', country: 'TH' },
  { code: '+62', label: '🇮🇩 +62', country: 'ID' },
  { code: '+63', label: '🇵🇭 +63', country: 'PH' },
  { code: '+91', label: '🇮🇳 +91', country: 'IN' },
  { code: '+44', label: '🇬🇧 +44', country: 'GB' },
  { code: '+1', label: '🇺🇸 +1', country: 'US' },
  { code: '+61', label: '🇦🇺 +61', country: 'AU' },
];

function parsePhone(value: string): { countryCode: string; number: string } {
  if (!value) return { countryCode: '+60', number: '' };

  // Try to match a known country code (longest match first)
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const cc of sorted) {
    if (value.startsWith(cc.code)) {
      return { countryCode: cc.code, number: value.slice(cc.code.length) };
    }
  }

  // If starts with + but not a known code, keep as-is
  if (value.startsWith('+')) {
    return { countryCode: '+60', number: value };
  }

  // No prefix — default to +60
  return { countryCode: '+60', number: value };
}

interface PhoneInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (fullNumber: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function PhoneInput({ id, label, value, onChange, placeholder = 'Phone number', required }: PhoneInputProps) {
  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [number, setNumber] = useState(parsed.number);

  // Sync from external value changes
  useEffect(() => {
    const p = parsePhone(value);
    setCountryCode(p.countryCode);
    setNumber(p.number);
  }, [value]);

  const handleCodeChange = (newCode: string) => {
    setCountryCode(newCode);
    onChange(number ? newCode + number : '');
  };

  const handleNumberChange = (newNumber: string) => {
    setNumber(newNumber);
    onChange(newNumber ? countryCode + newNumber : '');
  };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
          {label}
        </label>
      )}
      <div className="flex">
        <div className="relative">
          <select
            value={countryCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            className="appearance-none h-full pl-3 pr-7 py-2 border border-r-0 border-gray-300 dark:border-zinc-500 rounded-l-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
          >
            {COUNTRY_CODES.map((cc) => (
              <option key={cc.code} value={cc.code}>
                {cc.label}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <input
          id={id}
          type="tel"
          value={number}
          onChange={(e) => handleNumberChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-r-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
        />
      </div>
    </div>
  );
}
