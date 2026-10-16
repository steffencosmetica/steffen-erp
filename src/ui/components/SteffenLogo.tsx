import React from 'react';
import { STEFFEN_LOGO_VIEWBOX, STEFFEN_LOGO_UI_FILL, STEFFEN_LOGO_PATHS } from './steffen-logo-geometry';

export const SteffenLogoIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => {
  return (
    <svg
      viewBox={STEFFEN_LOGO_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Steffen Logo"
    >
      {STEFFEN_LOGO_PATHS.map((d) => (
        <path key={d} d={d} fill={STEFFEN_LOGO_UI_FILL} />
      ))}
    </svg>
  );
};
