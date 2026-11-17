import React from 'react';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  customName?: string;
  customLogoUrl?: string | null;
  brandColor?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  customName,
  customLogoUrl,
  brandColor,
  size = 'md',
}) => {
  const iconSize = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const accent = brandColor || (variant === 'light' ? '#2DD4BF' : '#0D9488');

  if (customName) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        {customLogoUrl ? (
          <img src={customLogoUrl} alt={customName} className={`${iconSize} rounded-lg object-cover border border-slate-200`} />
        ) : (
          <div
            className={`${iconSize} rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0`}
            style={{ backgroundColor: accent }}
          >
            {customName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className={`font-semibold tracking-tight truncate ${variant === 'light' ? 'text-white' : 'text-navy-950'} ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
            {customName}
          </div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${variant === 'light' ? 'text-slate-400' : 'text-slate-400'}`}>
            Powered by BizWave
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg
        viewBox="0 0 36 36"
        className={iconSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          width="36"
          height="36"
          rx="9"
          fill={variant === 'light' ? '#0D2B4B' : '#041527'}
        />
        <path
          d="M7 21.5C10.2 15.5 13.8 15.5 17 20C20.2 24.5 23.8 24.5 29 14"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="29" cy="14" r="2.2" fill={accent} />
      </svg>
      <span className={`font-bold tracking-tight ${textSize}`}>
        <span className={variant === 'light' ? 'text-white' : 'text-navy-950'}>Biz</span>
        <span style={{ color: accent }}>Wave</span>
      </span>
    </div>
  );
};
